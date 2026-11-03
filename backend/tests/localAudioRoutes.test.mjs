import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  createLocalAudioRouter,
  isPublicIPv4,
  mappedRadioUrl,
  podcastStreamUrl,
  rewriteHlsPlaylist,
} from "../dist/localAudioRoutes.js";

test("local audio: only public IPv4 addresses are proxied", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.14",
    "172.19.0.1", "169.254.169.254", "100.64.2.1",
    "0.0.0.0", "192.0.2.11", "198.51.100.3", "203.0.113.42"]) {
    assert.equal(isPublicIPv4(address), false, address);
  }
  assert.equal(isPublicIPv4("1.1.1.1"), true);
  assert.equal(isPublicIPv4("8.8.8.8"), true);
  assert.equal(isPublicIPv4("::1"), false);
});

test("local audio: only episode mappings expose playable podcast URLs", () => {
  assert.equal(podcastStreamUrl({
    media_type: "podcast_episode",
    provider_mappings: [{
      item_id: "feed guid",
      provider_domain: "itunes_podcasts",
      url: "https://cdn.example.org/episode.mp3",
    }],
  }), "https://cdn.example.org/episode.mp3");
  assert.equal(podcastStreamUrl({
    media_type: "track",
    provider_mappings: [{ url: "https://cdn.example.org/episode.mp3" }],
  }), null);
  assert.equal(podcastStreamUrl({
    media_type: "podcast_episode",
    provider_mappings: [{ url: "file:///etc/passwd" }],
  }), null);
});

test("local audio: radio mappings accept direct URLs, not local file paths", () => {
  assert.equal(mappedRadioUrl({
    media_type: "radio",
    provider_mappings: [{ item_id: "https://example.org/radio.mp3" }],
  }), "https://example.org/radio.mp3");
  assert.equal(mappedRadioUrl({
    media_type: "radio",
    provider_mappings: [{ item_id: "file:///etc/passwd" }],
  }), null);
});

test("local audio: stream requests cannot directly choose arbitrary URLs", async () => {
  const commands = [];
  const command = async (name, args) => {
    commands.push({ name, args });
    if (name === "music/radios/library_items") {
      return [{ uri: "library://radio/99", media_type: "radio", item_id: "99" }];
    }
    if (name === "music/podcasts/library_items") return [];
    throw new Error("Unexpected Music Assistant command");
  };
  const app = express();
  app.use("/api/local-audio", createLocalAudioRouter(command));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/local-audio`;
    let response = await fetch(base + "/stream?kind=radio&uri=" +
      encodeURIComponent("https://evil.example/stream"));
    assert.equal(response.status, 422);
    response = await fetch(base + "/stream?kind=podcast&uri=x&podcastId=2&offset=-1");
    assert.equal(response.status, 400);
    response = await fetch(base + "/source?kind=music&uri=x");
    assert.equal(response.status, 400);
    assert.ok(commands.every((entry) => entry.name !== "music/item_by_uri"));
  } finally {
    await new Promise((resolve, reject) =>
      server.close((err) => err ? reject(err) : resolve()));
  }
});

test("local audio: a library radio URL works even when full lookup is unavailable", async () => {
  const called = [];
  const command = async (name) => {
    called.push(name);
    if (name === "music/radios/library_items") return [{
      item_id: "4", uri: "library://radio/4", media_type: "radio",
      provider_mappings: [{ url: "https://1.1.1.1/live.mp3" }],
    }];
    throw new Error("Full lookup is unavailable");
  };
  const app = express();
  app.use("/api/local-audio", createLocalAudioRouter(command));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/local-audio/source?kind=radio&uri=${encodeURIComponent("library://radio/4")}`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match((await response.json()).src, /kind=radio/);
    assert.ok(!called.includes("music/item_by_uri"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("local audio: fetches full podcast episode when the listing lacks a stream URL", async () => {
  const called = [];
  const command = async (name, args) => {
    called.push(name);
    if (name === "music/podcasts/library_items") return [{
      item_id: "12", uri: "library://podcast/12", media_type: "podcast",
    }];
    if (name === "music/podcasts/podcast_episodes") return [{
      item_id: "episode-id", uri: "provider://podcast_episode/episode-id",
      media_type: "podcast_episode", provider: "itunes_podcasts",
    }];
    if (name === "music/podcasts/podcast_episode") {
      assert.equal(args.item_id, "episode-id");
      return {
        item_id: "episode-id", media_type: "podcast_episode",
        provider_mappings: [{ url: "https://8.8.8.8/episode.mp3" }],
      };
    }
    throw new Error("Unexpected command");
  };
  const app = express();
  app.use("/api/local-audio", createLocalAudioRouter(command));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const params = new URLSearchParams({
      kind: "podcast", podcastId: "12", offset: "0",
      uri: "provider://podcast_episode/episode-id",
    });
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/local-audio/source?${params}`
    );
    assert.equal(response.status, 200);
    assert.ok(called.includes("music/podcasts/podcast_episode"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test("local audio: HLS master and media playlists rewrite all remote resources", () => {
  const master = [
    "#EXTM3U",
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Swedish",URI="audio/index.m3u8"',
    "#EXT-X-STREAM-INF:BANDWIDTH=82000,AUDIO=\"a\"",
    "variants/low.m3u8?key=abc",
    "",
  ].join("\n");
  const media = [
    "#EXTM3U",
    "#EXT-X-TARGETDURATION:6",
    '#EXT-X-KEY:METHOD=AES-128,URI="../keys/key.bin"',
    '#EXT-X-MAP:URI="init.mp4"',
    "#EXTINF:6.000,",
    "seg001.aac",
    "#EXTINF:6.000,",
    "https://cdn.example.net/seg002.aac",
    "",
  ].join("\n");
  const rewrite = (origin) => `/api/local-audio/hls/${encodeURIComponent(origin)}`;
  const first = rewriteHlsPlaylist(master, "https://audio.example.org/root/master.m3u8", rewrite);
  assert.match(first, /\/api\/local-audio\/hls\//);
  assert.match(first, /https%3A%2F%2Faudio.example.org%2Froot%2Faudio%2Findex.m3u8/);
  assert.match(first, /https%3A%2F%2Faudio.example.org%2Froot%2Fvariants%2Flow.m3u8/);
  assert.match(first, /#EXT-X-STREAM-INF:BANDWIDTH=82000/);
  const second = rewriteHlsPlaylist(media, "https://audio.example.org/live/playlist.m3u8", rewrite);
  assert.match(second, /https%3A%2F%2Faudio.example.org%2Fkeys%2Fkey.bin/);
  assert.match(second, /https%3A%2F%2Faudio.example.org%2Flive%2Finit.mp4/);
  assert.match(second, /https%3A%2F%2Fcdn.example.net%2Fseg002.aac/);
  assert.ok(!second.includes("\nseg001.aac\n"));
});

test("local audio: HLS manifest cannot inject private or dangerous protocols into the stream proxy", () => {
  assert.throws(() =>
    rewriteHlsPlaylist("#EXTM3U\nfile:///etc/passwd\n", "https://example.org/root.m3u8")
  );
  assert.throws(() =>
    rewriteHlsPlaylist("#EXTM3U\n#EXT-X-KEY:URI=\"data:text/plain,secret\"\n", "https://example.org/root.m3u8")
  );
  assert.throws(() =>
    rewriteHlsPlaylist("<html>not audio</html>", "https://example.org/root.m3u8")
  );
});

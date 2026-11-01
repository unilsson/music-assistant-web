import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createPodcastRouter } from "../dist/podcastRoutes.js";

const episode = {
  item_id: "episode-1",
  uri: "itunes_podcast://podcast_episode/episode-1",
  media_type: "podcast_episode",
  name: "Avsnitt 1",
  duration: 3600,
  resume_position_ms: 120000,
  fully_played: false,
  podcast: { name: "Testpodd" },
};
const show = { item_id: "2", uri: "library://podcast/2", name: "Testpodd" };
const mockState = { current_type: "podcast_episode" };

async function withServer(fn) {
  const commands = [];
  const command = async (name, args) => {
    commands.push({ name, args });
    if (name === "music/podcasts/library_items") return { result: [show] };
    if (name === "music/podcasts/podcast_episodes") return { result: [episode] };
    if (name === "music/in_progress_items") return { result: [episode] };
    if (name === "player_queues/all") return {
      result: [{
        queue_id: "kitchen",
        state: "playing",
        duration: 3600,
        current_item: { media_item: { media_type: mockState.current_type, duration: 3600 } },
      }],
    };
    return { result: null };
  };
  const app = express();
  app.use(express.json());
  app.use("/api/podcasts", createPodcastRouter(command));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/podcasts`;
    const post = (path, body) => fetch(base + path, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await fn({ commands, base, post });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("Sprint 2: in-progress list exposes progress and completion state", async () => {
  await withServer(async ({ base }) => {
    const result = await fetch(base + "/in-progress");
    assert.equal(result.status, 200);
    const json = await result.json();
    assert.equal(json.count, 1);
    assert.equal(json.episodes[0].resumePositionMs, 120000);
    assert.equal(json.episodes[0].podcastName, "Testpodd");
    assert.equal(json.episodes[0].fullyPlayed, false);
  });
});

test("Sprint 2: resume only accepts an in-progress episode", async () => {
  await withServer(async ({ post, commands }) => {
    const invalid = await post("/kitchen/resume", { episodeUri: "evil://podcast_episode/xyz" });
    assert.equal(invalid.status, 404);
    const ok = await post("/kitchen/resume", { episodeUri: episode.uri });
    assert.equal(ok.status, 200);
    assert.ok(commands.some((item) => item.name === "player_queues/play_media" && item.args.media === episode.uri));
  });
});

test("Sprint 2: skip/seek target the selected podcast player only", async () => {
  await withServer(async ({ post, commands }) => {
    mockState.current_type = "podcast_episode";
    assert.equal((await post("/kitchen/skip", { seconds: -15 })).status, 200);
    assert.equal((await post("/kitchen/skip", { seconds: 30 })).status, 200);
    assert.equal((await post("/kitchen/skip", { seconds: 250 })).status, 400);
    assert.equal((await post("/kitchen/seek", { position: 120 })).status, 200);
    assert.equal((await post("/kitchen/seek", { position: 99999 })).status, 400);
    assert.ok(commands.some((item) => item.name === "player_queues/skip" && item.args.seconds === -15));
    assert.ok(commands.some((item) => item.name === "player_queues/seek" && item.args.position === 120));
    mockState.current_type = "track";
    assert.equal((await post("/kitchen/skip", { seconds: -15 })).status, 409);
    assert.equal((await post("/kitchen/seek", { position: 120 })).status, 409);
  });
});

import { lookup } from "node:dns/promises";
import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import * as http from "node:http";
import * as https from "node:https";
import { Router, type Request, type Response } from "express";

type Command = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
const EPISODE_PAGE_SIZE = 50;
const RADIO_BROWSER_BASE = "https://de1.api.radio-browser.info";
const REDIRECT_LIMIT = 4;
const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;
const MAX_HLS_RESOURCES = 12000;
const HLS_RESOURCE_AGE_MS = 12 * 60 * 60 * 1000;
const HLS_MIME = /(?:apple\.mpegurl|x-mpegurl|\/mpegurl)/i;

// Opaque server-side references: the browser never supplies an arbitrary
// upstream URL and HLS origin query parameters do not leak into the UI.
const hlsResources = new Map<string, { url: string; expires: number }>();
const hlsTokensByUrl = new Map<string, string>();

function hlsLink(target: string): string {
  const url = httpUrl(target);
  if (!url) throw new Error("Invalid HLS media URL");
  const existing = hlsTokensByUrl.get(url);
  if (existing) {
    const entry = hlsResources.get(existing);
    if (entry && entry.expires > Date.now()) return `/api/local-audio/hls/${existing}`;
  }
  const token = randomBytes(24).toString("base64url");
  hlsResources.set(token, { url, expires: Date.now() + HLS_RESOURCE_AGE_MS });
  hlsTokensByUrl.set(url, token);
  // Drop the oldest inactive segment URLs before they accumulate indefinitely.
  while (hlsResources.size > MAX_HLS_RESOURCES) {
    const oldest = hlsResources.keys().next().value as string | undefined;
    if (!oldest) break;
    const old = hlsResources.get(oldest);
    hlsResources.delete(oldest);
    if (old && hlsTokensByUrl.get(old.url) === oldest) hlsTokensByUrl.delete(old.url);
  }
  return `/api/local-audio/hls/${token}`;
}

function hlsTarget(token: string): string | null {
  if (!/^[a-zA-Z0-9_-]{32}$/.test(token)) return null;
  const entry = hlsResources.get(token);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    hlsResources.delete(token);
    if (hlsTokensByUrl.get(entry.url) === token) hlsTokensByUrl.delete(entry.url);
    return null;
  }
  return entry.url;
}

/** Rewrite variant playlists, media segments and URI="..." attributes
 * (audio variants, initialization segments, and AES-128 keys) to local paths. */
export function rewriteHlsPlaylist(
  manifest: string,
  originUrl: string,
  makeLink: (url: string) => string = hlsLink
): string {
  if (!manifest.replace(/^\uFEFF/, "").trimStart().startsWith("#EXTM3U")) {
    throw new Error("Not an HLS playlist");
  }
  const rewrite = (value: string) => {
    const url = httpUrl(new URL(value, originUrl).href);
    if (!url) throw new Error("Unsupported HLS resource URI");
    return makeLink(url);
  };
  return manifest.split(/\r?\n/).map((line) => {
    if (line.startsWith("#")) {
      return line.replace(/URI="([^"]+)"/g, (_whole, value: string) =>
        `URI="${rewrite(value)}"`);
    }
    const trimmed = line.trim();
    return trimmed ? rewrite(trimmed) : line;
  }).join("\n");
}

function items(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.result)) return value.result;
  return [];
}

function str(value: unknown, max = 2048): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max
    ? value : null;
}

function pageOffset(input: unknown): number | null {
  const n = Number(input ?? 0);
  return Number.isSafeInteger(n) && n >= 0 && n <= 100000 ? n : null;
}

function providerMappings(item: any): any[] {
  const mappings = item?.provider_mappings;
  return Array.isArray(mappings)
    ? mappings
    : mappings && typeof mappings === "object"
      ? Object.values(mappings)
      : [];
}

function httpUrl(candidate: unknown): string | null {
  if (typeof candidate !== "string") return null;
  try {
    const url = new URL(candidate);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username && !url.password && !url.hash
    ) return url.href;
  } catch { /* not a URL */ }
  return null;
}

export function podcastStreamUrl(episode: any): string | null {
  if (episode?.media_type !== "podcast_episode") return null;
  // RSS providers (iTunes, Podcastfeed etc.) publish the enclosure in mapping.url.
  return providerMappings(episode).map((mapping) => httpUrl(mapping?.url))
    .find((url): url is string => url !== null) ?? null;
}

export function mappedRadioUrl(item: any): string | null {
  if (item?.media_type && item.media_type !== "radio") return null;
  const mappings = providerMappings(item);
  for (const mapping of mappings) {
    const url = httpUrl(mapping?.url) ?? httpUrl(mapping?.item_id);
    if (url) return url;
  }
  return null;
}

function radioBrowserId(item: any): string | null {
  for (const mapping of providerMappings(item)) {
    if (
      mapping?.provider_domain === "radiobrowser" &&
      typeof mapping.item_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mapping.item_id)
    ) return mapping.item_id;
  }
  return null;
}

async function radioBrowserUrl(uuid: string): Promise<string | null> {
  const response = await fetch(`${RADIO_BROWSER_BASE}/json/stations/byuuid/${uuid}`, {
    headers: { "User-Agent": "music-assistant-web/1.0 (local playback)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Radio Browser is unavailable");
  const data = await response.json() as any;
  const station = Array.isArray(data) ? data.find((row: any) => row.stationuuid === uuid) : null;
  return httpUrl(station?.url_resolved) ?? httpUrl(station?.url);
}

async function resolvePodcast(
  command: Command, podcastId: string, episodeUri: string, offset: number
): Promise<string | null> {
  const library = items(await command("music/podcasts/library_items", { limit: 500, offset: 0 }));
  const podcast = library.find((p) =>
    String(p?.item_id ?? p?.id ?? "") === podcastId &&
    typeof p.uri === "string" && p.uri.startsWith("library://podcast/")
  );
  if (!podcast) return null;
  const episodeList = items(await command("music/podcasts/podcast_episodes", {
    item_id: podcastId, provider_instance_id_or_domain: "library",
    limit: EPISODE_PAGE_SIZE, offset,
  }));
  const episode = episodeList.find((ep) =>
    ep?.uri === episodeUri && ep?.media_type === "podcast_episode");
  if (!episode) return null;
  const direct = podcastStreamUrl(episode);
  if (direct) return direct;

  // Some Music Assistant versions expose slim episode listings without an
  // enclosure mapping. Fetch the provider's full episode before giving up.
  const provider = str(episode.provider, 200);
  const itemId = str(episode.item_id, 2048);
  if (provider && provider !== "library" && itemId) {
    try {
      const response = await command("music/podcasts/podcast_episode", {
        item_id: itemId, provider_instance_id_or_domain: provider,
      });
      const full = (response as any)?.result ?? response;
      if (full?.media_type === "podcast_episode") {
        return podcastStreamUrl(full);
      }
    } catch (error) {
      console.warn("Unable to resolve full podcast episode metadata:", error);
    }
  }
  return null;
}

async function resolveRadio(command: Command, radioUri: string): Promise<string | null> {
  const library = items(await command("music/radios/library_items", { limit: 500, offset: 0 }));
  const radio = library.find((item) => item?.uri === radioUri &&
    typeof item.uri === "string" && item.uri.startsWith("library://radio/"));
  if (!radio) return null;

  // First try the mapping already present in the library. A failed full-item
  // lookup must not prevent using an otherwise valid direct station URL.
  const libraryUrl = mappedRadioUrl(radio);
  if (libraryUrl) return libraryUrl;

  let full: any = radio;
  try {
    const raw = await command("music/item_by_uri", { uri: radioUri });
    full = (raw as any)?.result ?? raw;
  } catch (error) {
    console.warn("Unable to resolve detailed radio metadata:", error);
  }
  const direct = mappedRadioUrl(full);
  if (direct) return direct;
  const uuid = radioBrowserId(full) ?? radioBrowserId(radio);
  if (uuid) return radioBrowserUrl(uuid);
  return null;
}

export function isPublicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const a = address.split(".").map(Number);
  const [first, second, third] = a;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false; // CGNAT
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && (second === 168 || (second === 0 && third === 0) ||
      (second === 0 && third === 2) || (second === 88 && third === 99))) return false;
  if (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
}

async function publicIP(host: string): Promise<string> {
  if (isIP(host)) {
    if (!isPublicIPv4(host)) throw new Error("Private or unsupported stream address");
    return host;
  }
  if (!host.includes(".") || /\.(local|localhost|internal|home|lan)$/i.test(host)) {
    throw new Error("Local or internal stream address");
  }
  const resolved = await lookup(host, { family: 4, all: true });
  const publicAddress = resolved.find((entry) => isPublicIPv4(entry.address));
  if (!publicAddress) throw new Error("No public IPv4 address for stream");
  return publicAddress.address;
}

function validRange(range: string | string[] | undefined): string | null {
  if (typeof range !== "string") return null;
  return /^bytes=\d*-\d*$/.test(range) ? range : null;
}

/** Stream audio with Range support, validating DNS on each redirect and pinning the checked IP.
 * No client-supplied URL is ever accepted. URL must have been resolved from the MA library. */
async function proxyStream(
  target: string, req: Request, res: Response, redirects = 0,
  ignoreRange = false
): Promise<void> {
  if (redirects > REDIRECT_LIMIT) throw new Error("Too many redirects");
  const url = new URL(target);
  if (!httpUrl(target)) throw new Error("Unsupported stream URL");
  const ip = await publicIP(url.hostname);
  if (res.destroyed) return;

  const transport = url.protocol === "https:" ? https : http;
  await new Promise<void>((resolve, reject) => {
    const headers: Record<string, string> = {
      "User-Agent": "music-assistant-web/1.0 (local audio proxy)",
      "Accept": "*/*",
    };
    const range = ignoreRange ? null : validRange(req.headers.range);
    if (range) headers.Range = range;
    // Node supports autoSelectFamily at runtime, but it is not yet part of
    // the @types/node HTTP RequestOptions definition.
    const requestOptions: http.RequestOptions & { autoSelectFamily: boolean } = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "GET",
      headers,
      // Node.js 22 enables autoSelectFamily by default; in that mode the
      // custom lookup must return an address array (options.all=true).
      // We already validated and pinned one public IPv4, so disable
      // family auto-selection to use the single-address lookup contract.
      family: 4,
      autoSelectFamily: false,
      lookup: (_hostname, _options, callback) => callback(null, ip, 4),
    };
    const upstream = transport.request(requestOptions, (audio) => {
      const code = audio.statusCode ?? 502;
      if ([301, 302, 303, 307, 308].includes(code) && audio.headers.location) {
        audio.resume();
        const destination = new URL(audio.headers.location, url).href;
        void proxyStream(destination, req, res, redirects + 1, ignoreRange).then(resolve, reject);
        return;
      }
      if (code !== 200 && code !== 206) {
        audio.resume();
        res.status(code >= 400 && code < 500 ? 422 : 502)
          .type("text/plain").end("Ljudkällan kunde inte öppnas.");
        resolve();
        return;
      }
      const contentType = audio.headers["content-type"];
      const mime = typeof contentType === "string" ? contentType.toLowerCase() : "";
      if (/\b(text\/html|application\/json|application\/xml|text\/xml|audio\/x-scpls)\b/.test(mime)) {
        audio.resume();
        res.status(415).type("text/plain").end("Ljudkällan skickar inget direktspelbart ljud.");
        resolve();
        return;
      }
      const playlist = HLS_MIME.test(mime) || /\.m3u8$/i.test(url.pathname);
      if (playlist) {
        // Safari sometimes asks for bytes 0-1023 before knowing this is HLS.
        // A 206 can contain only part of the manifest: re-fetch it in full.
        if (code === 206 && !ignoreRange) {
          audio.resume();
          void proxyStream(target, req, res, redirects, true).then(resolve, reject);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        audio.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_PLAYLIST_BYTES) {
            audio.destroy(new Error("HLS playlist exceeds size limit"));
            return;
          }
          chunks.push(chunk);
        });
        audio.on("error", reject);
        audio.on("end", () => {
          try {
            const transformed = rewriteHlsPlaylist(
              Buffer.concat(chunks).toString("utf8"), url.href
            );
            res.status(200)
              .set({
                "Content-Type": "application/vnd.apple.mpegurl",
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
              })
              .end(transformed);
            resolve();
          } catch (error) { reject(error); }
        });
        return;
      }
      res.status(code);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
        const value = audio.headers[key];
        if (typeof value === "string") res.setHeader(key, value);
      }
      if (!res.hasHeader("Content-Type")) {
        res.setHeader("Content-Type", url.pathname.toLowerCase().endsWith(".mp3")
          ? "audio/mpeg" : "application/octet-stream");
      }
      const abort = () => { if (!res.writableEnded) upstream.destroy(); };
      res.once("close", abort);
      audio.on("error", (err) => {
        if (!res.destroyed) res.destroy(err);
      });
      audio.on("end", () => {
        res.off("close", abort);
        resolve();
      });
      audio.pipe(res);
    });
    upstream.setTimeout(20000, () => upstream.destroy(new Error("Audio source timed out")));
    upstream.on("error", reject);
    upstream.end();
  });
}

export function createLocalAudioRouter(command: Command) {
  const router = Router();

  async function source(req: Request, res: Response): Promise<void> {
    const kind = req.query.kind;
    const uri = str(req.query.uri);
    const podcastId = str(req.query.podcastId, 150);
    const offset = pageOffset(req.query.offset);
    if (!uri || (kind !== "podcast" && kind !== "radio") ||
      (kind === "podcast" && (!podcastId || offset === null))) {
      res.status(400).json({ error: "Felaktig begäran om lokal uppspelning" });
      return;
    }
    try {
      const url = kind === "podcast"
        ? await resolvePodcast(command, podcastId!, uri, offset!)
        : await resolveRadio(command, uri);
      if (!url) {
        res.status(422).json({
          error: "Ingen direktspelbar HTTP-ljudström hittades för detta objekt.",
        });
        return;
      }
      // Validate before returning a playback URL; run it again for every stream GET.
      await publicIP(new URL(url).hostname);
      const params = new URLSearchParams({ kind, uri });
      if (kind === "podcast") {
        params.set("podcastId", podcastId!);
        params.set("offset", String(offset));
      }
      res.json({ src: `/api/local-audio/stream?${params}` });
    } catch (error) {
      console.error("Local audio source error:", error);
      res.status(502).json({ error: "Kunde inte förbereda ljudströmmen." });
    }
  }

  router.get("/source", (req, res) => { void source(req, res); });
  router.get("/hls/:token", async (req, res) => {
    const url = hlsTarget(req.params.token);
    if (!url) {
      res.status(404).type("text/plain").end("Ljudlänken är ogiltig eller har gått ut.");
      return;
    }
    try {
      await proxyStream(url, req, res);
    } catch (error) {
      console.error("Local HLS audio error:", error);
      if (!res.headersSent) res.status(502).type("text/plain").end("HLS-ljudet kunde inte hämtas.");
      else res.destroy();
    }
  });
  router.get("/stream", async (req, res) => {
    const kind = req.query.kind;
    const uri = str(req.query.uri);
    const podcastId = str(req.query.podcastId, 150);
    const offset = pageOffset(req.query.offset);
    if (!uri || (kind !== "podcast" && kind !== "radio") ||
      (kind === "podcast" && (!podcastId || offset === null))) {
      res.status(400).type("text/plain").end("Ogiltig ljudkälla.");
      return;
    }
    try {
      const url = kind === "podcast"
        ? await resolvePodcast(command, podcastId!, uri, offset!)
        : await resolveRadio(command, uri);
      if (!url) {
        res.status(422).type("text/plain").end("Källan saknar spelbar direktström.");
        return;
      }
      await proxyStream(url, req, res);
    } catch (error) {
      console.error("Local audio stream error:", error);
      if (!res.headersSent) res.status(502).type("text/plain").end("Ljudströmmen kunde inte hämtas.");
      else res.destroy();
    }
  });

  return router;
}

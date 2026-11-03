import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as http from "node:http";
import * as https from "node:https";
import { Router, type Request, type Response } from "express";

type Command = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
const EPISODE_PAGE_SIZE = 50;
const RADIO_BROWSER_BASE = "https://de1.api.radio-browser.info";
const REDIRECT_LIMIT = 4;

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
  const episode = episodeList.find((ep) => ep?.uri === episodeUri && ep?.media_type === "podcast_episode");
  return episode ? podcastStreamUrl(episode) : null;
}

async function resolveRadio(command: Command, radioUri: string): Promise<string | null> {
  const library = items(await command("music/radios/library_items", { limit: 500, offset: 0 }));
  const radio = library.find((item) => item?.uri === radioUri &&
    typeof item.uri === "string" && item.uri.startsWith("library://radio/"));
  if (!radio) return null;

  // The library response is not guaranteed to contain complete provider mappings.
  const raw = await command("music/item_by_uri", { uri: radioUri });
  const full = (raw as any)?.result ?? raw;
  const direct = mappedRadioUrl(full) ?? mappedRadioUrl(radio);
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
  target: string, req: Request, res: Response, redirects = 0
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
    const range = validRange(req.headers.range);
    if (range) headers.Range = range;
    const upstream = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "GET",
      headers,
      lookup: (_hostname, _options, callback) => callback(null, ip, 4),
    }, (audio) => {
      const code = audio.statusCode ?? 502;
      if ([301, 302, 303, 307, 308].includes(code) && audio.headers.location) {
        audio.resume();
        const destination = new URL(audio.headers.location, url).href;
        void proxyStream(destination, req, res, redirects + 1).then(resolve, reject);
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

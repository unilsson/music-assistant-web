import { Router } from "express";

type Command = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const PAGE_SIZE = 50;

type Podcast = {
  id: string;
  name: string;
  uri: string;
  image: string | null;
  publisher: string | null;
  description: string | null;
};

type PodcastEpisode = {
  id: string;
  uri: string;
  title: string;
  image: string | null;
  duration: number | null;
  publishedAt: string | number | null;
  description: string | null;
};

function arrayOf(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.result)) return value.result;
  return [];
}

function imageOf(value: any): string | null {
  const path = value?.image?.path ?? value?.metadata?.images?.[0]?.path ?? null;
  return typeof path === "string" && path.length > 0 ? path : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function podcastOf(value: any): Podcast | null {
  const id = String(value?.item_id ?? value?.id ?? "");
  const uri = optionalText(value?.uri) ?? "";
  if (!id || !uri.startsWith("library://podcast/")) return null;
  return {
    id,
    uri,
    name: optionalText(value?.name) ?? "Podcast",
    image: imageOf(value),
    publisher: optionalText(value?.publisher ?? value?.metadata?.publisher),
    description: optionalText(value?.metadata?.description ?? value?.description),
  };
}

function episodeOf(value: any): PodcastEpisode | null {
  const id = String(value?.item_id ?? value?.id ?? "");
  const uri = optionalText(value?.uri) ?? "";
  if (!id || !uri || value?.media_type !== "podcast_episode") return null;
  const seconds = Number(value?.duration);
  const published = value?.metadata?.release_date ?? value?.release_date ?? null;
  return {
    id,
    uri,
    title: optionalText(value?.name) ?? "Avsnitt",
    image: imageOf(value),
    duration: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
    publishedAt: (typeof published === "string" || typeof published === "number") ? published : null,
    description: optionalText(value?.metadata?.description ?? value?.description),
  };
}

async function library(command: Command): Promise<Podcast[]> {
  const response = await command("music/podcasts/library_items", { limit: 500, offset: 0 });
  return arrayOf(response)
    .map(podcastOf)
    .filter((item): item is Podcast => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

async function episodes(command: Command, id: string, offset: number): Promise<PodcastEpisode[]> {
  const response = await command("music/podcasts/podcast_episodes", {
    item_id: id,
    provider_instance_id_or_domain: "library",
    limit: PAGE_SIZE,
    offset,
  });
  return arrayOf(response).map(episodeOf).filter((item): item is PodcastEpisode => item !== null);
}

function parseOffset(input: unknown): number | null {
  const value = typeof input === "string" || typeof input === "number" ? Number(input) : NaN;
  return Number.isSafeInteger(value) && value >= 0 && value <= 100000 ? value : null;
}

export function createPodcastRouter(command: Command) {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const podcasts = await library(command);
      res.json({ status: "ok", count: podcasts.length, podcasts });
    } catch (error) {
      console.error("Unable to retrieve podcasts:", error);
      res.status(502).json({ status: "error", error: "Unable to retrieve podcasts from Music Assistant" });
    }
  });

  router.get("/:podcastId/episodes", async (req, res) => {
    const offset = parseOffset(req.query.offset ?? 0);
    if (offset === null) {
      res.status(400).json({ status: "error", error: "Invalid offset" });
      return;
    }

    try {
      const podcast = (await library(command)).find((item) => item.id === req.params.podcastId);
      if (!podcast) {
        res.status(404).json({ status: "error", error: "Podcast is not in the library" });
        return;
      }

      const page = await episodes(command, podcast.id, offset);
      res.json({ status: "ok", podcast, offset, limit: PAGE_SIZE, hasMore: page.length === PAGE_SIZE, episodes: page });
    } catch (error) {
      console.error("Unable to retrieve podcast episodes:", error);
      res.status(502).json({ status: "error", error: "Unable to retrieve podcast episodes" });
    }
  });

  router.post("/:podcastId/:playerId/play", async (req, res) => {
    const uri = optionalText(req.body?.episodeUri);
    const offset = parseOffset(req.body?.offset);

    if (!uri || uri.length > 2048 || offset === null) {
      res.status(400).json({ status: "error", error: "A valid episode URI and offset are required" });
      return;
    }

    try {
      const podcast = (await library(command)).find((item) => item.id === req.params.podcastId);
      if (!podcast) {
        res.status(404).json({ status: "error", error: "Podcast is not in the library" });
        return;
      }

      // Only accept a URI actually returned for this library podcast on the selected page.
      // Never forward arbitrary stream URLs or other media types to Music Assistant.
      const page = await episodes(command, podcast.id, offset);
      const episode = page.find((item) => item.uri === uri);
      if (!episode) {
        res.status(404).json({ status: "error", error: "Episode not found on this podcast page; refresh the list" });
        return;
      }

      await command("player_queues/play_media", {
        queue_id: req.params.playerId,
        media: episode.uri,
        option: "replace",
      });

      res.json({ status: "ok", playerId: req.params.playerId, episode: episode.uri });
    } catch (error) {
      console.error("Unable to start podcast episode:", error);
      res.status(502).json({ status: "error", error: "Unable to start podcast episode" });
    }
  });

  return router;
}

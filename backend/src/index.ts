import "dotenv/config";
import express from "express";
import { maCommand } from "./musicAssistant.js";

const app = express();

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());

function unwrapArray(response: any): any[] {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.result)) {
    return response.result;
  }

  return [];
}

function summarizeQueueItem(item: any) {
  if (!item) {
    return null;
  }

  const mediaItem = item?.media_item ?? item?.media_item_data ?? null;

  let artist: string | null = null;

  if (Array.isArray(mediaItem?.artists)) {
    artist = mediaItem.artists
      .map((entry: any) => entry?.name)
      .filter(Boolean)
      .join(", ");
  } else if (typeof mediaItem?.artist === "string") {
    artist = mediaItem.artist;
  } else if (typeof item?.artist === "string") {
    artist = item.artist;
  }

  const album =
    mediaItem?.album?.name ??
    mediaItem?.album ??
    item?.album ??
    null;

  const image =
    mediaItem?.image?.path ??
    mediaItem?.metadata?.images?.[0]?.path ??
    item?.image?.path ??
    null;

  return {
    id: item?.queue_item_id ?? mediaItem?.item_id ?? null,
    title: mediaItem?.name ?? item?.name ?? null,
    artist,
    album,
    image,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "music-assistant-web",
  });
});

/*
 * Raw Music Assistant status.
 *
 * Useful during development/debugging, but the frontend should normally
 * use /api/players instead.
 */
app.get("/api/ma/status", async (_req, res) => {
  try {
    const result = await maCommand("player_queues/all");

    res.json({
      status: "ok",
      musicAssistant: result,
    });
  } catch (error) {
    console.error("Music Assistant status error:", error);

    res.status(502).json({
      status: "error",
      error: "Unable to communicate with Music Assistant",
    });
  }
});

/*
 * Simplified list of currently available players.
 */
app.get("/api/players", async (_req, res) => {
  try {
    const response = await maCommand("player_queues/all");
    const queues = unwrapArray(response);

    const players = queues
      .filter((queue: any) => queue.available === true)
      .map((queue: any) => ({
        id: queue.queue_id,
        name: queue.display_name ?? queue.queue_id,
        available: queue.available ?? false,
        state: queue.state ?? "unknown",
        active: queue.active ?? false,
        items: queue.items ?? 0,
        elapsedTime: queue.elapsed_time ?? null,
        duration: queue.duration ?? null,
        nowPlaying: summarizeQueueItem(queue.current_item),
      }));

    res.json({
      status: "ok",
      count: players.length,
      players,
    });
  } catch (error) {
    console.error("Music Assistant players error:", error);

    res.status(502).json({
      status: "error",
      error: "Unable to retrieve players from Music Assistant",
    });
  }
});

/*
 * Return only the small slice of the selected player's queue that the
 * frontend needs for previous/current/next previews.
 */
app.get("/api/players/:id/queue-context", async (req, res) => {
  try {
    const playerId = req.params.id;
    const queuesResponse = await maCommand("player_queues/all");
    const queues = unwrapArray(queuesResponse);
    const queue = queues.find((entry: any) => entry.queue_id === playerId);

    if (!queue) {
      res.status(404).json({
        status: "error",
        error: "Player queue not found",
      });
      return;
    }

    const currentIndex =
      typeof queue.current_index === "number" ? queue.current_index : null;

    if (currentIndex === null) {
      res.json({
        status: "ok",
        playerId,
        previous: null,
        current: summarizeQueueItem(queue.current_item),
        next: null,
      });
      return;
    }

    const offset = Math.max(0, currentIndex - 1);
    const itemsResponse = await maCommand("player_queues/items", {
      queue_id: playerId,
      limit: 3,
      offset,
    });
    const items = unwrapArray(itemsResponse);

    let relativeIndex = currentIndex - offset;
    const currentQueueItemId = queue.current_item?.queue_item_id;

    if (currentQueueItemId) {
      const foundIndex = items.findIndex(
        (item: any) => item?.queue_item_id === currentQueueItemId
      );
      if (foundIndex >= 0) {
        relativeIndex = foundIndex;
      }
    }

    const previousItem = relativeIndex > 0 ? items[relativeIndex - 1] : null;
    const currentItem = items[relativeIndex] ?? queue.current_item ?? null;
    const nextItem =
      relativeIndex + 1 < items.length ? items[relativeIndex + 1] : null;

    res.json({
      status: "ok",
      playerId,
      previous: summarizeQueueItem(previousItem),
      current: summarizeQueueItem(currentItem),
      next: summarizeQueueItem(nextItem),
    });
  } catch (error) {
    console.error("Music Assistant queue context error:", error);

    res.status(502).json({
      status: "error",
      error: "Unable to retrieve queue context from Music Assistant",
    });
  }
});

/*
 * Toggle play/pause for a queue/player.
 */
app.post("/api/players/:id/play-pause", async (req, res) => {
  try {
    const playerId = req.params.id;

    const result = await maCommand("player_queues/play_pause", {
      queue_id: playerId,
    });

    res.json({
      status: "ok",
      playerId,
      action: "play-pause",
      result,
    });
  } catch (error) {
    console.error("Music Assistant play/pause error:", error);

    res.status(502).json({
      status: "error",
      error: "Unable to toggle play/pause",
    });
  }
});

/*
 * Skip to the next queue item.
 */
app.post("/api/players/:id/next", async (req, res) => {
  try {
    const playerId = req.params.id;

    const result = await maCommand("player_queues/next", {
      queue_id: playerId,
    });

    res.json({
      status: "ok",
      playerId,
      action: "next",
      result,
    });
  } catch (error) {
    console.error("Music Assistant next error:", error);

    res.status(502).json({
      status: "error",
      error: "Unable to skip to next item",
    });
  }
});

/*
 * Go to the previous queue item.
 */
app.post("/api/players/:id/previous", async (req, res) => {
  try {
    const playerId = req.params.id;

    const result = await maCommand("player_queues/previous", {
      queue_id: playerId,
    });

    res.json({
      status: "ok",
      playerId,
      action: "previous",
      result,
    });
  } catch (error) {
    console.error("Music Assistant previous error:", error);

    res.status(502).json({
      status: "error",
      error: "Unable to go to previous item",
    });
  }
});

/*
 * Set player volume.
 *
 * JSON body:
 * {
 *   "volume": 35
 * }
 */
app.post("/api/players/:id/volume", async (req, res) => {
  try {
    const playerId = req.params.id;
    const volume = Number(req.body?.volume);

    if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
      res.status(400).json({
        status: "error",
        error: "volume must be a number between 0 and 100",
      });
      return;
    }

    const volumeLevel = Math.round(volume);

    const result = await maCommand("players/cmd/volume_set", {
      player_id: playerId,
      volume_level: volumeLevel,
    });

    res.json({
      status: "ok",
      playerId,
      action: "volume",
      volume: volumeLevel,
      result,
    });
  } catch (error) {
    console.error("Music Assistant volume error:", error);

    res.status(502).json({
      status: "error",
      error: "Unable to set volume",
    });
  }
});

app.listen(port, host, () => {
  console.log(
    `Music Assistant Web backend listening on http://${host}:${port}`
  );
});

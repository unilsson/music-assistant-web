import { Router } from "express";
import { normalizeRadioLibrary } from "./radioLibrary.js";

type Command = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function asArray(value: any): any[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray(value?.result)) {
    return value.result;
  }
  return [];
}

export function createRadioRouter(command: Command) {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const response = await command("music/radios/library_items", {
        limit: 200,
        offset: 0,
      });
      const radios = normalizeRadioLibrary(asArray(response));
      res.json({ status: "ok", count: radios.length, radios });
    } catch (error) {
      console.error("Music Assistant radios error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to retrieve radio stations from Music Assistant",
      });
    }
  });

  router.post("/:playerId/play", async (req, res) => {
    try {
      const playerId = req.params.playerId;
      const uri = typeof req.body?.uri === "string" ? req.body.uri.trim() : "";

      if (!uri.startsWith("library://radio/")) {
        res.status(400).json({
          status: "error",
          error: "A Music Assistant library radio URI is required",
        });
        return;
      }

      const result = await command("player_queues/play_media", {
        queue_id: playerId,
        media: uri,
        option: "replace",
      });

      res.json({
        status: "ok",
        playerId,
        uri,
        result,
      });
    } catch (error) {
      console.error("Music Assistant radio playback error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to start radio station",
      });
    }
  });

  router.post("/:playerId/stop", async (req, res) => {
    try {
      const playerId = req.params.playerId;
      const result = await command("player_queues/stop", {
        queue_id: playerId,
      });

      res.json({
        status: "ok",
        playerId,
        action: "stop",
        result,
      });
    } catch (error) {
      console.error("Music Assistant radio stop error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to stop radio",
      });
    }
  });

  return router;
}

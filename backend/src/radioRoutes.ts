import { Router } from "express";
import {
  normalizeRadioGenres,
  normalizeRadioLibrary,
  type RadioGenre,
  type RadioStation,
} from "./radioLibrary.js";

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

async function loadRadioLibraryWithGenres(command: Command): Promise<RadioStation[]> {
  const response = await command("music/radios/library_items", {
    limit: 200,
    offset: 0,
  });
  const radios = normalizeRadioLibrary(asArray(response));

  try {
    const genreResponse = await command("music/genres/library_items", {
      limit: 500,
      offset: 0,
      media_type: "radio",
      content_type: "music",
    });
    const genres = normalizeRadioGenres(asArray(genreResponse));

    const memberships = await Promise.all(
      genres.map(async (genre) => {
        const genreId = Number(genre.id);
        if (!Number.isFinite(genreId)) {
          return { genre, stationIds: new Set<string>() };
        }

        try {
          const genreRadiosResponse = await command("music/radios/library_items", {
            limit: 200,
            offset: 0,
            genre: genreId,
          });
          const stationIds = new Set(
            normalizeRadioLibrary(asArray(genreRadiosResponse)).map((station) => station.id)
          );
          return { genre, stationIds };
        } catch (error) {
          console.warn(`Unable to retrieve radio stations for genre ${genre.name}:`, error);
          return { genre, stationIds: new Set<string>() };
        }
      })
    );

    const genresByStationId = new Map<string, RadioGenre[]>();
    for (const { genre, stationIds } of memberships) {
      for (const stationId of stationIds) {
        const stationGenres = genresByStationId.get(stationId) ?? [];
        stationGenres.push(genre);
        genresByStationId.set(stationId, stationGenres);
      }
    }

    return radios.map((station) => ({
      ...station,
      genres: genresByStationId.get(station.id) ?? [],
    }));
  } catch (error) {
    console.warn("Unable to retrieve Music Assistant radio genres:", error);
    return radios;
  }
}

export function createRadioRouter(command: Command) {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const radios = await loadRadioLibraryWithGenres(command);
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

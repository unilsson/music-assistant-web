import { Router } from "express";

type Command = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function resultObject(value: any): any {
  if (value?.result && typeof value.result === "object" && !Array.isArray(value.result)) {
    return value.result;
  }
  return value && typeof value === "object" ? value : {};
}

function asArray(value: any): any[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray(value?.result)) {
    return value.result;
  }
  return [];
}

function cleanSearchQuery(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

export function createMusicSearchFavoriteRouter(command: Command) {
  const router = Router();

  router.post("/albums/favorite", async (req, res) => {
    const query = cleanSearchQuery(req.body?.query);
    const uri = typeof req.body?.uri === "string" ? req.body.uri.trim() : "";

    if (query.length < 2 || !uri) {
      res.status(400).json({
        status: "error",
        error: "query and uri are required",
      });
      return;
    }

    try {
      const response = await command("music/search", {
        search_query: query,
        media_types: ["album"],
        limit: 25,
      });
      const result = resultObject(response);
      const albums = asArray(result?.albums);
      const album = albums.find((item: any) => item?.uri === uri);

      if (!album) {
        res.status(404).json({
          status: "error",
          error: "Album was not found in the search results",
        });
        return;
      }

      await command("music/favorites/add_item", {
        item: uri,
      });

      res.json({
        status: "ok",
        query,
        uri,
        favorite: true,
      });
    } catch (error) {
      console.error("Music Assistant add album favorite error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to add album to favorites",
      });
    }
  });

  return router;
}

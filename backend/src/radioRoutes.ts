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

  return router;
}

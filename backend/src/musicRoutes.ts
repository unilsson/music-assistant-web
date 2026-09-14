import { Router } from "express";
import {
  normalizeMusicAlbums,
  normalizeMusicArtists,
  normalizeMusicPlaylists,
  normalizeMusicTracks,
  normalizeSearchAlbums,
  normalizeSearchArtists,
  normalizeSearchPlaylists,
  normalizeSearchTracks,
  type MusicAlbum,
  type MusicArtist,
  type MusicPlaylist,
  type MusicTrack,
} from "./musicLibrary.js";

type Command = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type FavoriteKind = "track" | "album" | "artist" | "playlist";
type FavoriteItem = MusicTrack | MusicAlbum | MusicArtist | MusicPlaylist;
type SearchKind = FavoriteKind;
type SearchItem = FavoriteItem;
type MusicSearchResults = {
  tracks: MusicTrack[];
  albums: MusicAlbum[];
  artists: MusicArtist[];
  playlists: MusicPlaylist[];
};

const SEARCH_MEDIA_TYPES = ["track", "album", "artist", "playlist"];

function asArray(value: any): any[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray(value?.result)) {
    return value.result;
  }
  return [];
}

function resultObject(value: any): any {
  if (value?.result && typeof value.result === "object" && !Array.isArray(value.result)) {
    return value.result;
  }
  return value && typeof value === "object" ? value : {};
}

function cleanSearchQuery(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

async function loadPlaylists(command: Command): Promise<MusicPlaylist[]> {
  const response = await command("music/playlists/library_items", {
    limit: 500,
    offset: 0,
  });
  return normalizeMusicPlaylists(asArray(response));
}

async function findPlaylist(command: Command, playlistId: string): Promise<MusicPlaylist | null> {
  const playlists = await loadPlaylists(command);
  return playlists.find((playlist) => playlist.id === playlistId) ?? null;
}

async function loadPlaylistTracks(command: Command, playlistId: string): Promise<MusicTrack[]> {
  const response = await command("music/playlists/playlist_tracks", {
    item_id: playlistId,
    provider_instance_id_or_domain: "library",
  });
  return normalizeMusicTracks(asArray(response));
}

async function loadFavoriteTracks(command: Command): Promise<MusicTrack[]> {
  const response = await command("music/tracks/library_items", {
    favorite: true,
    limit: 500,
    offset: 0,
  });
  return normalizeMusicTracks(asArray(response)).sort((a, b) =>
    a.title.localeCompare(b.title, "sv")
  );
}

async function loadFavoriteAlbums(command: Command): Promise<MusicAlbum[]> {
  const response = await command("music/albums/library_items", {
    favorite: true,
    limit: 500,
    offset: 0,
  });
  return normalizeMusicAlbums(asArray(response));
}

async function loadFavoriteAlbumDetail(
  command: Command,
  albumId: string
): Promise<{ album: MusicAlbum; tracks: MusicTrack[] } | null> {
  const albums = await loadFavoriteAlbums(command);
  const album = albums.find((item) => item.id === albumId);
  if (!album) {
    return null;
  }

  const response = await command("music/albums/album_tracks", {
    item_id: album.id,
    provider_instance_id_or_domain: "library",
  });

  return {
    album,
    tracks: normalizeMusicTracks(asArray(response)),
  };
}

async function loadFavoriteArtists(command: Command): Promise<MusicArtist[]> {
  const response = await command("music/artists/library_items", {
    favorite: true,
    limit: 500,
    offset: 0,
  });
  return normalizeMusicArtists(asArray(response));
}

async function loadFavoritePlaylists(command: Command): Promise<MusicPlaylist[]> {
  const response = await command("music/playlists/library_items", {
    favorite: true,
    limit: 500,
    offset: 0,
  });
  return normalizeMusicPlaylists(asArray(response));
}

async function loadFavorites(command: Command) {
  const [tracks, albums, artists, playlists] = await Promise.all([
    loadFavoriteTracks(command),
    loadFavoriteAlbums(command),
    loadFavoriteArtists(command),
    loadFavoritePlaylists(command),
  ]);

  return { tracks, albums, artists, playlists };
}

async function searchMusic(
  command: Command,
  query: string,
  limit = 12
): Promise<MusicSearchResults> {
  const response = await command("music/search", {
    search_query: query,
    media_types: SEARCH_MEDIA_TYPES,
    limit,
  });
  const result = resultObject(response);

  return {
    tracks: normalizeSearchTracks(asArray(result?.tracks)),
    albums: normalizeSearchAlbums(asArray(result?.albums)),
    artists: normalizeSearchArtists(asArray(result?.artists)),
    playlists: normalizeSearchPlaylists(asArray(result?.playlists)),
  };
}

async function findFavorite(
  command: Command,
  kind: FavoriteKind,
  itemId: string
): Promise<FavoriteItem | null> {
  let items: FavoriteItem[];

  switch (kind) {
    case "track":
      items = await loadFavoriteTracks(command);
      break;
    case "album":
      items = await loadFavoriteAlbums(command);
      break;
    case "artist":
      items = await loadFavoriteArtists(command);
      break;
    case "playlist":
      items = await loadFavoritePlaylists(command);
      break;
  }

  return items.find((item) => item.id === itemId) ?? null;
}

async function findSearchItem(
  command: Command,
  query: string,
  kind: SearchKind,
  uri: string
): Promise<SearchItem | null> {
  const results = await searchMusic(command, query, 25);
  let items: SearchItem[];

  switch (kind) {
    case "track":
      items = results.tracks;
      break;
    case "album":
      items = results.albums;
      break;
    case "artist":
      items = results.artists;
      break;
    case "playlist":
      items = results.playlists;
      break;
  }

  return items.find((item) => item.uri === uri) ?? null;
}

function favoriteKind(value: string): FavoriteKind | null {
  return value === "track" || value === "album" || value === "artist" || value === "playlist"
    ? value
    : null;
}

function searchKind(value: unknown): SearchKind | null {
  return typeof value === "string" ? favoriteKind(value) : null;
}

export function createMusicRouter(command: Command) {
  const router = Router();

  router.get("/playlists", async (_req, res) => {
    try {
      const playlists = await loadPlaylists(command);
      res.json({ status: "ok", count: playlists.length, playlists });
    } catch (error) {
      console.error("Music Assistant playlists error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to retrieve playlists from Music Assistant",
      });
    }
  });

  router.get("/favorites", async (_req, res) => {
    try {
      const favorites = await loadFavorites(command);
      res.json({
        status: "ok",
        count:
          favorites.tracks.length +
          favorites.albums.length +
          favorites.artists.length +
          favorites.playlists.length,
        ...favorites,
      });
    } catch (error) {
      console.error("Music Assistant favorites error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to retrieve favorites from Music Assistant",
      });
    }
  });

  router.get("/favorites/albums/:albumId", async (req, res) => {
    try {
      const detail = await loadFavoriteAlbumDetail(command, req.params.albumId);
      if (!detail) {
        res.status(404).json({ status: "error", error: "Favorite album not found" });
        return;
      }

      res.json({
        status: "ok",
        album: detail.album,
        count: detail.tracks.length,
        tracks: detail.tracks,
      });
    } catch (error) {
      console.error("Music Assistant favorite album details error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to retrieve favorite album from Music Assistant",
      });
    }
  });

  router.get("/search", async (req, res) => {
    const query = cleanSearchQuery(req.query.q);
    if (query.length < 2) {
      res.status(400).json({ status: "error", error: "Search query must contain at least 2 characters" });
      return;
    }

    try {
      const results = await searchMusic(command, query);
      res.json({
        status: "ok",
        query,
        count:
          results.tracks.length +
          results.albums.length +
          results.artists.length +
          results.playlists.length,
        ...results,
      });
    } catch (error) {
      console.error("Music Assistant search error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to search Music Assistant",
      });
    }
  });

  router.get("/playlists/:playlistId", async (req, res) => {
    try {
      const playlistId = req.params.playlistId;
      const playlist = await findPlaylist(command, playlistId);

      if (!playlist) {
        res.status(404).json({ status: "error", error: "Playlist not found" });
        return;
      }

      const tracks = await loadPlaylistTracks(command, playlistId);
      res.json({
        status: "ok",
        playlist,
        count: tracks.length,
        tracks,
      });
    } catch (error) {
      console.error("Music Assistant playlist details error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to retrieve playlist from Music Assistant",
      });
    }
  });

  router.post("/:playerId/search/play", async (req, res) => {
    const playerId = req.params.playerId;
    const query = cleanSearchQuery(req.body?.query);
    const kind = searchKind(req.body?.kind);
    const uri = typeof req.body?.uri === "string" ? req.body.uri.trim() : "";

    if (query.length < 2 || !kind || !uri) {
      res.status(400).json({ status: "error", error: "query, kind and uri are required" });
      return;
    }

    try {
      const item = await findSearchItem(command, query, kind, uri);
      if (!item) {
        res.status(404).json({ status: "error", error: "Search result not found" });
        return;
      }

      const shuffle = kind !== "track" && req.body?.shuffle === true;
      const result = await command("player_queues/play_media", {
        queue_id: playerId,
        media: item.uri,
        option: "replace",
        shuffle,
      });

      res.json({
        status: "ok",
        playerId,
        kind,
        uri: item.uri,
        shuffle,
        result,
      });
    } catch (error) {
      console.error("Music Assistant search playback error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to start search result",
      });
    }
  });

  router.post("/:playerId/favorites/albums/:albumId/tracks/play", async (req, res) => {
    try {
      const playerId = req.params.playerId;
      const albumId = req.params.albumId;
      const trackUri = typeof req.body?.trackUri === "string" ? req.body.trackUri.trim() : "";

      if (!trackUri) {
        res.status(400).json({ status: "error", error: "trackUri is required" });
        return;
      }

      const detail = await loadFavoriteAlbumDetail(command, albumId);
      if (!detail) {
        res.status(404).json({ status: "error", error: "Favorite album not found" });
        return;
      }

      const track = detail.tracks.find((item) => item.uri === trackUri);
      if (!track) {
        res.status(400).json({
          status: "error",
          error: "Track does not belong to the selected favorite album",
        });
        return;
      }

      const result = await command("player_queues/play_media", {
        queue_id: playerId,
        media: detail.album.uri,
        option: "replace",
        start_item: track.uri,
        shuffle: false,
      });

      res.json({
        status: "ok",
        playerId,
        albumId,
        track: { id: track.id, uri: track.uri, title: track.title },
        result,
      });
    } catch (error) {
      console.error("Music Assistant favorite album track playback error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to start favorite album from selected track",
      });
    }
  });

  router.post("/:playerId/favorites/:kind/:itemId/play", async (req, res) => {
    try {
      const playerId = req.params.playerId;
      const kind = favoriteKind(req.params.kind);
      const itemId = req.params.itemId;

      if (!kind) {
        res.status(400).json({ status: "error", error: "Unsupported favorite type" });
        return;
      }

      const item = await findFavorite(command, kind, itemId);
      if (!item) {
        res.status(404).json({ status: "error", error: "Favorite item not found" });
        return;
      }

      const shuffle = kind !== "track" && req.body?.shuffle === true;
      const result = await command("player_queues/play_media", {
        queue_id: playerId,
        media: item.uri,
        option: "replace",
        shuffle,
      });

      res.json({
        status: "ok",
        playerId,
        kind,
        itemId,
        shuffle,
        result,
      });
    } catch (error) {
      console.error("Music Assistant favorite playback error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to start favorite",
      });
    }
  });

  router.post("/:playerId/playlists/:playlistId/play", async (req, res) => {
    try {
      const playerId = req.params.playerId;
      const playlistId = req.params.playlistId;
      const playlist = await findPlaylist(command, playlistId);

      if (!playlist) {
        res.status(404).json({ status: "error", error: "Playlist not found" });
        return;
      }

      const shuffle = req.body?.shuffle === true;
      const result = await command("player_queues/play_media", {
        queue_id: playerId,
        media: playlist.uri,
        option: "replace",
        shuffle,
      });

      res.json({
        status: "ok",
        playerId,
        playlistId,
        shuffle,
        result,
      });
    } catch (error) {
      console.error("Music Assistant playlist playback error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to start playlist",
      });
    }
  });

  router.post("/:playerId/playlists/:playlistId/tracks/play", async (req, res) => {
    try {
      const playerId = req.params.playerId;
      const playlistId = req.params.playlistId;
      const trackUri = typeof req.body?.trackUri === "string" ? req.body.trackUri.trim() : "";

      if (!trackUri) {
        res.status(400).json({ status: "error", error: "trackUri is required" });
        return;
      }

      const playlist = await findPlaylist(command, playlistId);
      if (!playlist) {
        res.status(404).json({ status: "error", error: "Playlist not found" });
        return;
      }

      const tracks = await loadPlaylistTracks(command, playlistId);
      const track = tracks.find((item) => item.uri === trackUri);

      if (!track) {
        res.status(400).json({
          status: "error",
          error: "Track does not belong to the selected playlist",
        });
        return;
      }

      const result = await command("player_queues/play_media", {
        queue_id: playerId,
        media: track.uri,
        option: "replace",
      });

      res.json({
        status: "ok",
        playerId,
        playlistId,
        track: { id: track.id, uri: track.uri, title: track.title },
        result,
      });
    } catch (error) {
      console.error("Music Assistant track playback error:", error);
      res.status(502).json({
        status: "error",
        error: "Unable to start track",
      });
    }
  });

  return router;
}

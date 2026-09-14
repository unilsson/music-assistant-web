import type { MusicAlbum, MusicTrack } from "../api";
import "./album-dialog-tracks.css";

export type FavoriteAlbumDetail = {
  album: MusicAlbum;
  tracks: MusicTrack[];
};

type FavoriteAlbumDetailResponse = FavoriteAlbumDetail & {
  status: string;
  count: number;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function getFavoriteAlbum(albumId: string): Promise<FavoriteAlbumDetail> {
  const data = (await request(
    `/api/music/favorites/albums/${encodeURIComponent(albumId)}`
  )) as FavoriteAlbumDetailResponse;

  return {
    album: data.album,
    tracks: data.tracks,
  };
}

export async function playFavoriteAlbumFromTrack(
  playerId: string,
  albumId: string,
  trackUri: string
) {
  return request(
    `/api/music/${encodeURIComponent(playerId)}/favorites/albums/${encodeURIComponent(albumId)}/tracks/play`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trackUri }),
    }
  );
}

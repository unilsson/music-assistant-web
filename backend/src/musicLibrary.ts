export type MusicPlaylist = {
  id: string;
  name: string;
  uri: string;
  image: string | null;
  provider: string | null;
  favorite: boolean;
};

export type MusicTrack = {
  id: string;
  uri: string;
  title: string;
  artist: string | null;
  album: string | null;
  image: string | null;
  duration: number | null;
  position: number | null;
  provider: string | null;
};

function imagePath(item: any): string | null {
  return (
    item?.image?.path ??
    item?.metadata?.images?.[0]?.path ??
    item?.album?.image?.path ??
    item?.album?.metadata?.images?.[0]?.path ??
    null
  );
}

function artistName(item: any): string | null {
  if (Array.isArray(item?.artists)) {
    const names = item.artists
      .map((artist: any) => artist?.name)
      .filter((name: unknown): name is string => typeof name === "string" && name.length > 0);
    return names.length > 0 ? names.join(", ") : null;
  }

  if (typeof item?.artist === "string") {
    return item.artist;
  }

  if (typeof item?.artist?.name === "string") {
    return item.artist.name;
  }

  return null;
}

function durationSeconds(value: unknown): number | null {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function positionNumber(value: unknown): number | null {
  const position = Number(value);
  return Number.isFinite(position) && position >= 0 ? position : null;
}

export function normalizeMusicPlaylists(items: any[]): MusicPlaylist[] {
  return items
    .map((item: any) => ({
      id: String(item?.item_id ?? item?.id ?? ""),
      name: String(item?.name ?? "Spellista").trim() || "Spellista",
      uri: typeof item?.uri === "string" ? item.uri : "",
      image: imagePath(item),
      provider: typeof item?.provider === "string" ? item.provider : null,
      favorite: item?.favorite === true,
    }))
    .filter(
      (playlist: MusicPlaylist) =>
        playlist.id.length > 0 && playlist.uri.startsWith("library://playlist/")
    )
    .sort((a: MusicPlaylist, b: MusicPlaylist) => a.name.localeCompare(b.name, "sv"));
}

export function normalizeMusicTracks(items: any[]): MusicTrack[] {
  return items
    .map((item: any, index: number) => ({
      id: String(item?.item_id ?? item?.id ?? item?.uri ?? index),
      uri: typeof item?.uri === "string" ? item.uri : "",
      title: String(item?.name ?? item?.title ?? "Låt").trim() || "Låt",
      artist: artistName(item),
      album:
        typeof item?.album === "string"
          ? item.album
          : typeof item?.album?.name === "string"
            ? item.album.name
            : null,
      image: imagePath(item),
      duration: durationSeconds(item?.duration),
      position: positionNumber(item?.position ?? item?.playlist_position ?? index + 1),
      provider: typeof item?.provider === "string" ? item.provider : null,
    }))
    .filter((track: MusicTrack) => track.uri.length > 0);
}

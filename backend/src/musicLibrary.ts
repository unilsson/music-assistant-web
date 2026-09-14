export type MusicPlaylist = {
  id: string;
  name: string;
  uri: string;
  image: string | null;
  provider: string | null;
  favorite: boolean;
};

export type MusicArtistRef = {
  id: string | null;
  uri: string | null;
  name: string;
};

export type MusicTrack = {
  id: string;
  uri: string;
  title: string;
  artist: string | null;
  artists: MusicArtistRef[];
  album: string | null;
  image: string | null;
  duration: number | null;
  position: number | null;
  provider: string | null;
};

export type MusicAlbum = {
  id: string;
  uri: string;
  name: string;
  artist: string | null;
  artists: MusicArtistRef[];
  image: string | null;
  year: number | null;
  provider: string | null;
};

export type MusicArtist = {
  id: string;
  uri: string;
  name: string;
  image: string | null;
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

function artistRefs(item: any): MusicArtistRef[] {
  const source = Array.isArray(item?.artists)
    ? item.artists
    : item?.artist !== undefined && item?.artist !== null
      ? [item.artist]
      : [];

  return source
    .map((artist: any): MusicArtistRef | null => {
      if (typeof artist === "string") {
        const name = artist.trim();
        return name ? { id: null, uri: null, name } : null;
      }

      const name = typeof artist?.name === "string" ? artist.name.trim() : "";
      if (!name) {
        return null;
      }

      const rawId = artist?.item_id ?? artist?.id;
      return {
        id: rawId !== undefined && rawId !== null ? String(rawId) : null,
        uri: typeof artist?.uri === "string" ? artist.uri : null,
        name,
      };
    })
    .filter((artist: MusicArtistRef | null): artist is MusicArtistRef => artist !== null);
}

function artistNameFromRefs(artists: MusicArtistRef[]): string | null {
  return artists.length > 0 ? artists.map((artist) => artist.name).join(", ") : null;
}

function durationSeconds(value: unknown): number | null {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function positionNumber(value: unknown): number | null {
  const position = Number(value);
  return Number.isFinite(position) && position >= 0 ? position : null;
}

function yearNumber(value: unknown): number | null {
  const year = Number(value);
  return Number.isInteger(year) && year > 0 ? year : null;
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
    .map((item: any, index: number) => {
      const artists = artistRefs(item);
      return {
        id: String(item?.item_id ?? item?.id ?? item?.uri ?? index),
        uri: typeof item?.uri === "string" ? item.uri : "",
        title: String(item?.name ?? item?.title ?? "Låt").trim() || "Låt",
        artist: artistNameFromRefs(artists),
        artists,
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
      };
    })
    .filter((track: MusicTrack) => track.uri.length > 0);
}

export function normalizeMusicAlbums(items: any[]): MusicAlbum[] {
  return items
    .map((item: any) => {
      const artists = artistRefs(item);
      return {
        id: String(item?.item_id ?? item?.id ?? ""),
        uri: typeof item?.uri === "string" ? item.uri : "",
        name: String(item?.name ?? "Album").trim() || "Album",
        artist: artistNameFromRefs(artists),
        artists,
        image: imagePath(item),
        year: yearNumber(item?.year),
        provider: typeof item?.provider === "string" ? item.provider : null,
      };
    })
    .filter(
      (album: MusicAlbum) => album.id.length > 0 && album.uri.startsWith("library://album/")
    )
    .sort((a: MusicAlbum, b: MusicAlbum) => a.name.localeCompare(b.name, "sv"));
}

export function normalizeMusicArtists(items: any[]): MusicArtist[] {
  return items
    .map((item: any) => ({
      id: String(item?.item_id ?? item?.id ?? ""),
      uri: typeof item?.uri === "string" ? item.uri : "",
      name: String(item?.name ?? "Artist").trim() || "Artist",
      image: imagePath(item),
      provider: typeof item?.provider === "string" ? item.provider : null,
    }))
    .filter(
      (artist: MusicArtist) => artist.id.length > 0 && artist.uri.startsWith("library://artist/")
    )
    .sort((a: MusicArtist, b: MusicArtist) => a.name.localeCompare(b.name, "sv"));
}

export type NowPlaying = {
  uri: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  image: string | null;
  mediaType: string | null;
  stationName: string | null;
  liveTitle: string | null;
  liveArtist: string | null;
  streamTitle: string | null;
};

export type QueuePreviewItem = {
  id: string | null;
  uri: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  image: string | null;
  mediaType: string | null;
  stationName: string | null;
  liveTitle: string | null;
  liveArtist: string | null;
  streamTitle: string | null;
};

export type QueueContext = {
  previous: QueuePreviewItem | null;
  current: QueuePreviewItem | null;
  next: QueuePreviewItem | null;
};

export type RadioGenre = {
  id: string;
  name: string;
};

export type RadioStation = {
  id: string;
  name: string;
  uri: string;
  image: string | null;
  provider: string | null;
  favorite: boolean;
  genres: RadioGenre[];
};

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

export type MusicFavorites = {
  tracks: MusicTrack[];
  albums: MusicAlbum[];
  artists: MusicArtist[];
  playlists: MusicPlaylist[];
};

export type FavoriteKind = "track" | "album" | "artist" | "playlist";

export type MusicPlaylistDetail = {
  playlist: MusicPlaylist;
  tracks: MusicTrack[];
};

export type Player = {
  id: string;
  name: string;
  available: boolean;
  state: string;
  active: boolean;
  items: number;
  elapsedTime: number | null;
  duration: number | null;
  volumeLevel: number | null;
  nowPlaying: NowPlaying | null;
};

type PlayersResponse = {
  status: string;
  count: number;
  players: Player[];
};

type QueueContextResponse = QueueContext & {
  status: string;
  playerId: string;
};

type RadiosResponse = {
  status: string;
  count: number;
  radios: RadioStation[];
};

type MusicPlaylistsResponse = {
  status: string;
  count: number;
  playlists: MusicPlaylist[];
};

type MusicPlaylistDetailResponse = {
  status: string;
  count: number;
  playlist: MusicPlaylist;
  tracks: MusicTrack[];
};

type MusicFavoritesResponse = MusicFavorites & {
  status: string;
  count: number;
};

type RawStatusResponse = {
  status: string;
  musicAssistant: unknown;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json();
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

function positiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) {
      return number;
    }
  }

  return null;
}

function rawQueueDuration(queue: any): number | null {
  const currentItem = queue?.current_item;
  const mediaItem = currentItem?.media_item ?? currentItem?.media_item_data;

  return positiveNumber(
    queue?.duration,
    currentItem?.duration,
    currentItem?.media_item?.duration,
    currentItem?.media_item_data?.duration,
    mediaItem?.duration,
    mediaItem?.metadata?.duration
  );
}

export async function getPlayers(): Promise<Player[]> {
  const data = (await request("/api/players")) as PlayersResponse;

  if (data.players.every((player) => (player.duration ?? 0) > 0 || player.nowPlaying?.mediaType === "radio")) {
    return data.players;
  }

  try {
    const raw = (await request("/api/ma/status")) as RawStatusResponse;
    const queues = asArray(raw.musicAssistant);

    return data.players.map((player) => {
      if ((player.duration ?? 0) > 0 || player.nowPlaying?.mediaType === "radio") {
        return player;
      }

      const queue = queues.find((entry: any) => entry?.queue_id === player.id);
      const duration = rawQueueDuration(queue);

      return duration ? { ...player, duration } : player;
    });
  } catch {
    return data.players;
  }
}

export async function getRadios(): Promise<RadioStation[]> {
  const data = (await request("/api/radios")) as RadiosResponse;
  return data.radios;
}

export async function getMusicPlaylists(): Promise<MusicPlaylist[]> {
  const data = (await request("/api/music/playlists")) as MusicPlaylistsResponse;
  return data.playlists;
}

export async function getMusicPlaylist(playlistId: string): Promise<MusicPlaylistDetail> {
  const data = (await request(
    `/api/music/playlists/${encodeURIComponent(playlistId)}`
  )) as MusicPlaylistDetailResponse;

  return {
    playlist: data.playlist,
    tracks: data.tracks,
  };
}

export async function getMusicFavorites(): Promise<MusicFavorites> {
  const data = (await request("/api/music/favorites")) as MusicFavoritesResponse;
  return {
    tracks: data.tracks,
    albums: data.albums,
    artists: data.artists,
    playlists: data.playlists,
  };
}

export async function playMusicFavorite(
  playerId: string,
  kind: FavoriteKind,
  itemId: string,
  shuffle = false
) {
  return request(
    `/api/music/${encodeURIComponent(playerId)}/favorites/${encodeURIComponent(kind)}/${encodeURIComponent(itemId)}/play`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ shuffle }),
    }
  );
}

export async function playMusicPlaylist(
  playerId: string,
  playlistId: string,
  shuffle = false
) {
  return request(
    `/api/music/${encodeURIComponent(playerId)}/playlists/${encodeURIComponent(playlistId)}/play`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ shuffle }),
    }
  );
}

export async function playMusicTrack(
  playerId: string,
  playlistId: string,
  trackUri: string
) {
  return request(
    `/api/music/${encodeURIComponent(playerId)}/playlists/${encodeURIComponent(playlistId)}/tracks/play`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trackUri }),
    }
  );
}

export async function playRadio(playerId: string, uri: string) {
  return request(`/api/radios/${encodeURIComponent(playerId)}/play`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uri }),
  });
}

export async function stopRadio(playerId: string) {
  return request(`/api/radios/${encodeURIComponent(playerId)}/stop`, {
    method: "POST",
  });
}

export async function getQueueContext(playerId: string): Promise<QueueContext> {
  const data = (await request(
    `/api/players/${encodeURIComponent(playerId)}/queue-context`
  )) as QueueContextResponse;

  return {
    previous: data.previous,
    current: data.current,
    next: data.next,
  };
}

export async function playPause(playerId: string) {
  return request(`/api/players/${encodeURIComponent(playerId)}/play-pause`, {
    method: "POST",
  });
}

export async function nextTrack(playerId: string) {
  return request(`/api/players/${encodeURIComponent(playerId)}/next`, {
    method: "POST",
  });
}

export async function previousTrack(playerId: string) {
  return request(`/api/players/${encodeURIComponent(playerId)}/previous`, {
    method: "POST",
  });
}

export async function setVolume(playerId: string, volume: number) {
  return request(`/api/players/${encodeURIComponent(playerId)}/volume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ volume }),
  });
}

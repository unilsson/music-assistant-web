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

export type RadioStation = {
  id: string;
  name: string;
  uri: string;
  image: string | null;
  provider: string | null;
  favorite: boolean;
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

export async function playRadio(playerId: string, uri: string) {
  return request(`/api/radios/${encodeURIComponent(playerId)}/play`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uri }),
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

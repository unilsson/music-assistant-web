export type NowPlaying = {
  title: string | null;
  artist: string | null;
  album: string | null;
  image: string | null;
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
  nowPlaying: NowPlaying | null;
};

type PlayersResponse = {
  status: string;
  count: number;
  players: Player[];
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function getPlayers(): Promise<Player[]> {
  const data = (await request("/api/players")) as PlayersResponse;
  return data.players;
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

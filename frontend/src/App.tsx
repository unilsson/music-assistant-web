import { useCallback, useEffect, useState } from "react";
import {
  getPlayers,
  nextTrack,
  playPause,
  previousTrack,
  setVolume,
  type Player,
} from "./api";

function PlayerCard({ player, onChanged }: { player: Player; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [volume, setLocalVolume] = useState(25);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const now = player.nowPlaying;
  const isPlaying = player.state === "playing";

  return (
    <article className="player-card">
      <div className="artwork-wrap">
        {now?.image ? (
          <img className="artwork" src={now.image} alt="" />
        ) : (
          <div className="artwork artwork-placeholder">♫</div>
        )}
        <span className={`status-dot ${isPlaying ? "playing" : ""}`} />
      </div>

      <div className="player-body">
        <div className="player-heading">
          <div>
            <h2>{player.name}</h2>
            <p className="state">{isPlaying ? "Spelar" : player.state === "paused" ? "Pausad" : "Redo"}</p>
          </div>
        </div>

        <div className="now-playing">
          <strong>{now?.title ?? "Inget spelar"}</strong>
          <span>{now?.artist ?? "Välj musik i Music Assistant"}</span>
          {now?.album && <small>{now.album}</small>}
        </div>

        <div className="transport" aria-label={`Styr ${player.name}`}>
          <button disabled={busy} onClick={() => run(() => previousTrack(player.id))} aria-label="Föregående">
            ◀◀
          </button>
          <button className="primary-control" disabled={busy} onClick={() => run(() => playPause(player.id))} aria-label="Spela eller pausa">
            {isPlaying ? "❚❚" : "▶"}
          </button>
          <button disabled={busy} onClick={() => run(() => nextTrack(player.id))} aria-label="Nästa">
            ▶▶
          </button>
        </div>

        <label className="volume-control">
          <span>Volym</span>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => setLocalVolume(Number(event.target.value))}
            onPointerUp={() => run(() => setVolume(player.id, volume))}
            onKeyUp={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                void run(() => setVolume(player.id, volume));
              }
            }}
          />
          <output>{volume}%</output>
        </label>
      </div>
    </article>
  );
}

export default function App() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getPlayers();
      setPlayers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte läsa spelarna");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Music Assistant</p>
          <h1>Musik hemma</h1>
          <p className="subtitle">Enkel styrning av dina tillgängliga spelare</p>
        </div>
        <button className="refresh-button" onClick={() => void refresh()}>
          Uppdatera
        </button>
      </header>

      {error && <div className="message error">{error}</div>}
      {loading && <div className="message">Läser spelare…</div>}

      {!loading && !error && players.length === 0 && (
        <div className="message">Inga tillgängliga spelare hittades.</div>
      )}

      <section className="player-grid">
        {players.map((player) => (
          <PlayerCard key={player.id} player={player} onChanged={refresh} />
        ))}
      </section>
    </main>
  );
}

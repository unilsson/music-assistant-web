import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPlayers,
  getQueueContext,
  getRadios,
  playRadio,
  type Player,
  type QueueContext,
  type RadioStation,
} from "./api";
import MusicView from "./music/MusicView";
import PlayerCard from "./player/PlayerCard";
import RadioLibrary from "./RadioLibrary";
import "./view-tabs.css";

const PLAYER_STORAGE_KEY = "music-assistant-web.selected-player";
const VIEW_STORAGE_KEY = "music-assistant-web.active-view";

type AppView = "music" | "radio";

function storedView(): AppView {
  return window.localStorage.getItem(VIEW_STORAGE_KEY) === "radio" ? "radio" : "music";
}

export default function App() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [queueContext, setQueueContext] = useState<QueueContext | null>(null);
  const [radios, setRadios] = useState<RadioStation[]>([]);
  const [radiosLoading, setRadiosLoading] = useState(true);
  const [radioError, setRadioError] = useState<string | null>(null);
  const [startingRadioUri, setStartingRadioUri] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>(storedView);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(() =>
    window.localStorage.getItem(PLAYER_STORAGE_KEY) ?? ""
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getPlayers();
      setPlayers(data);
      setError(null);

      const selectedPlayer = data.find((player) => player.id === selectedPlayerId);
      if (selectedPlayerId && selectedPlayer?.nowPlaying?.mediaType !== "radio") {
        try {
          setQueueContext(await getQueueContext(selectedPlayerId));
        } catch {
          setQueueContext(null);
        }
      } else {
        setQueueContext(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte läsa spelarna");
    } finally {
      setLoading(false);
    }
  }, [selectedPlayerId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;

    const loadRadios = async () => {
      try {
        const data = await getRadios();
        if (!cancelled) {
          setRadios(data);
          setRadioError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setRadioError(err instanceof Error ? err.message : "Kunde inte läsa radiostationerna");
        }
      } finally {
        if (!cancelled) {
          setRadiosLoading(false);
        }
      }
    };

    void loadRadios();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (players.length === 0) {
      return;
    }

    const selectedStillExists = players.some((player) => player.id === selectedPlayerId);
    if (!selectedPlayerId || !selectedStillExists) {
      const firstPlayerId = players[0].id;
      setSelectedPlayerId(firstPlayerId);
      window.localStorage.setItem(PLAYER_STORAGE_KEY, firstPlayerId);
    }
  }, [players, selectedPlayerId]);

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId]
  );

  const choosePlayer = (playerId: string) => {
    setSelectedPlayerId(playerId);
    setQueueContext(null);
    window.localStorage.setItem(PLAYER_STORAGE_KEY, playerId);
  };

  const chooseView = (view: AppView) => {
    setActiveView(view);
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  };

  const startRadioStation = async (station: RadioStation) => {
    if (!selectedPlayer || startingRadioUri) {
      return;
    }

    setStartingRadioUri(station.uri);
    setRadioError(null);

    try {
      await playRadio(selectedPlayer.id, station.uri);
      setQueueContext(null);
      await refresh();
    } catch (err) {
      setRadioError(err instanceof Error ? err.message : "Kunde inte starta radiostationen");
    } finally {
      setStartingRadioUri(null);
    }
  };

  const hasRadioSelection = selectedPlayer?.nowPlaying?.mediaType === "radio";
  const radioIsActive =
    hasRadioSelection &&
    (selectedPlayer?.state === "playing" || selectedPlayer?.state === "paused");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Music Assistant</p>
          <h1>Musik hemma</h1>
          <p className="subtitle">Välj spelare och styr musiken på ett enkelt sätt</p>
        </div>
      </header>

      <nav className="view-switcher" aria-label="Välj innehåll" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "music"}
          aria-controls="music-view"
          className={activeView === "music" ? "active" : ""}
          onClick={() => chooseView("music")}
        >
          <span className="view-switcher-icon" aria-hidden="true">♫</span>
          Musik
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "radio"}
          aria-controls="radio-view"
          className={activeView === "radio" ? "active" : ""}
          onClick={() => chooseView("radio")}
        >
          <span className="view-switcher-icon" aria-hidden="true">●</span>
          Radio
        </button>
      </nav>

      {error && <div className="message error">{error}</div>}
      {loading && <div className="message">Läser spelare…</div>}

      {!loading && !error && players.length === 0 && (
        <div className="message">Inga tillgängliga spelare hittades.</div>
      )}

      {!loading && !error && players.length > 0 && (
        <>
          <section className="player-selector" aria-label="Välj spelare">
            <label htmlFor="player-select">Spelare</label>
            <select
              id="player-select"
              value={selectedPlayerId}
              onChange={(event) => choosePlayer(event.target.value)}
            >
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="refresh-icon"
              onClick={() => void refresh()}
              aria-label="Uppdatera"
              title="Uppdatera"
            >
              ↻
            </button>
          </section>

          {selectedPlayer && activeView === "music" && (
            <section id="music-view" role="tabpanel" className="selected-player">
              <MusicView
                player={selectedPlayer}
                queueContext={queueContext}
                radioIsActive={radioIsActive}
                onChanged={refresh}
              />
            </section>
          )}

          {selectedPlayer && activeView === "radio" && (
            <section id="radio-view" role="tabpanel" className="radio-view">
              {hasRadioSelection && (
                <section
                  className="radio-player-section"
                  aria-label={radioIsActive ? "Radio spelar nu" : "Senast spelade radio"}
                >
                  <PlayerCard
                    player={selectedPlayer}
                    queueContext={null}
                    onChanged={refresh}
                    preserveRadio
                  />
                </section>
              )}

              <RadioLibrary
                stations={radios}
                playerName={selectedPlayer.name}
                currentUri={radioIsActive ? selectedPlayer.nowPlaying?.uri ?? null : null}
                currentName={
                  radioIsActive
                    ? selectedPlayer.nowPlaying?.stationName ?? selectedPlayer.nowPlaying?.title ?? null
                    : null
                }
                loading={radiosLoading}
                error={radioError}
                busyUri={startingRadioUri}
                onPlay={(station) => void startRadioStation(station)}
              />
            </section>
          )}
        </>
      )}
    </main>
  );
}

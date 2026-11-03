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
import PodcastsView from "./podcasts/PodcastsView";
import LocalAudioPlayer from "./local/LocalAudioPlayer";
import { BROWSER_PLAYER_ID, useLocalAudio } from "./local/useLocalAudio";
import "./view-tabs.css";

const PLAYER_STORAGE_KEY = "music-assistant-web.selected-player";
const VIEW_STORAGE_KEY = "music-assistant-web.active-view";

type AppView = "music" | "radio" | "podcasts";

function storedView(): AppView {
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return stored === "radio" || stored === "podcasts" ? stored : "music";
}

export default function App() {
  const localAudio = useLocalAudio();
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
    if (selectedPlayerId === BROWSER_PLAYER_ID) {
      return;
    }

    const selectedStillExists = players.some((player) => player.id === selectedPlayerId);
    if (!selectedPlayerId || !selectedStillExists) {
      const firstPlayerId = players[0]?.id ?? BROWSER_PLAYER_ID;
      setSelectedPlayerId(firstPlayerId);
      window.localStorage.setItem(PLAYER_STORAGE_KEY, firstPlayerId);
    }
  }, [players, selectedPlayerId]);

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId]
  );
  const localSelected = selectedPlayerId === BROWSER_PLAYER_ID;

  const choosePlayer = (playerId: string) => {
    if (selectedPlayerId === BROWSER_PLAYER_ID && playerId !== BROWSER_PLAYER_ID) {
      localAudio.stop();
    }
    setSelectedPlayerId(playerId);
    setQueueContext(null);
    window.localStorage.setItem(PLAYER_STORAGE_KEY, playerId);
  };

  const chooseView = (view: AppView) => {
    setActiveView(view);
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  };

  const startRadioStation = async (station: RadioStation) => {
    if (startingRadioUri || (!localSelected && !selectedPlayer)) {
      return;
    }

    if (localSelected) {
      localAudio.start({
        kind: "radio", uri: station.uri,
        title: station.name, image: station.image, subtitle: "Radio",
      });
      return;
    }

    setStartingRadioUri(station.uri);
    setRadioError(null);

    try {
      await playRadio(selectedPlayer!.id, station.uri);
      setQueueContext(null);
      await refresh();
    } catch (err) {
      setRadioError(err instanceof Error ? err.message : "Kunde inte starta radiostationen");
    } finally {
      setStartingRadioUri(null);
    }
  };

  const hasRadioSelection = selectedPlayer?.nowPlaying?.mediaType === "radio";
  const activePodcast = selectedPlayer?.nowPlaying?.mediaType === "podcast_episode"
    ? selectedPlayer.nowPlaying
    : queueContext?.current?.mediaType === "podcast_episode"
      ? queueContext.current
      : null;
  const podcastIsSelected = activePodcast !== null;
  const podcastIsPlayingOrPaused =
    podcastIsSelected &&
    (selectedPlayer?.state === "playing" || selectedPlayer?.state === "paused");
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
      {localAudio.audioElement}

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
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "podcasts"}
          aria-controls="podcasts-view"
          className={activeView === "podcasts" ? "active" : ""}
          onClick={() => chooseView("podcasts")}
        >
          <span className="view-switcher-icon" aria-hidden="true">🎙</span>
          Podcasts
        </button>
      </nav>

      {error && <div className="message error">{error}</div>}
      {loading && <div className="message">Läser spelare…</div>}

      {!loading && !error && (
        <>
          <section className="player-selector" aria-label="Välj spelare">
            <label htmlFor="player-select">Spelare</label>
            <select
              id="player-select"
              value={selectedPlayerId}
              onChange={(event) => choosePlayer(event.target.value)}
            >
              <option value={BROWSER_PLAYER_ID}>📱 Den här enheten</option>
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
          {localSelected && <LocalAudioPlayer controller={localAudio} />}

          {selectedPlayer && activeView !== "podcasts" && podcastIsPlayingOrPaused && activePodcast && (
            <aside className="podcast-active-notice" aria-label="Aktiv podcast">
              <span className="podcast-active-icon" aria-hidden="true">🎙</span>
              <div className="podcast-active-details">
                <span className="podcast-active-state">
                  Podcast {selectedPlayer.state === "playing" ? "spelar" : "pausad"} på {selectedPlayer.name}
                </span>
                <strong>{activePodcast.title ?? "Podcastavsnitt"}</strong>
              </div>
              <button
                type="button"
                className="podcast-active-link"
                onClick={() => chooseView("podcasts")}
              >
                Gå till Podcasts →
              </button>
            </aside>
          )}

          {localSelected && activeView === "music" && (
            <section id="music-view" role="tabpanel" className="message">
              Lokal uppspelning på den här enheten stöds just nu för Radio och Podcasts.
              Välj en Music Assistant-spelare ovan om du vill spela musik.
            </section>
          )}

          {selectedPlayer && !localSelected && activeView === "music" && (
            <section id="music-view" role="tabpanel" className="selected-player">
              <MusicView
                player={selectedPlayer}
                queueContext={queueContext}
                radioIsActive={radioIsActive}
                podcastIsSelected={podcastIsSelected}
                onChanged={refresh}
              />
            </section>
          )}

          {(localSelected || selectedPlayer) && activeView === "podcasts" && (
            <section id="podcasts-view" role="tabpanel" className="podcasts-view-panel">
              <PodcastsView
                player={selectedPlayer}
                localMode={localSelected}
                localHistory={localAudio.history}
                onLocalPlay={(podcast, episode, offset) =>
                  localAudio.start({
                    kind: "podcast", podcastId: podcast.id, offset,
                    uri: episode.uri, title: episode.title,
                    subtitle: podcast.name,
                    image: episode.image ?? podcast.image,
                    duration: episode.duration,
                  })
                }
                onLocalResume={(entry) => localAudio.start(entry)}
                queueContext={queueContext}
                onChanged={refresh}
              />
            </section>
          )}

          {(localSelected || selectedPlayer) && activeView === "radio" && (
            <section id="radio-view" role="tabpanel" className="radio-view">
              {!localSelected && hasRadioSelection && (
                <section
                  className="radio-player-section"
                  aria-label={radioIsActive ? "Radio spelar nu" : "Senast spelade radio"}
                >
                  <PlayerCard
                    player={selectedPlayer!}
                    queueContext={null}
                    onChanged={refresh}
                    preserveRadio
                  />
                </section>
              )}

              <RadioLibrary
                stations={radios}
                playerName={localSelected ? "den här enheten" : selectedPlayer!.name}
                currentUri={localSelected
                  ? (localAudio.item?.kind === "radio" ? localAudio.item.uri : null)
                  : radioIsActive ? selectedPlayer?.nowPlaying?.uri ?? null : null}
                currentName={localSelected
                  ? (localAudio.item?.kind === "radio" ? localAudio.item.title : null)
                  : radioIsActive ? selectedPlayer?.nowPlaying?.stationName ?? selectedPlayer?.nowPlaying?.title ?? null : null}
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

import { useCallback, useEffect, useState } from "react";
import {
  getPodcasts,
  getPodcastEpisodes,
  getPodcastInProgress,
  resumePodcastEpisode,
  playPodcastEpisode,
  type Player,
  type Podcast,
  type PodcastEpisode,
  type QueueContext,
} from "../api";
import PlayerCard from "../player/PlayerCard";
import type { LocalEpisodeRecord } from "../local/useLocalAudio";
import "./podcasts.css";

type EpisodeRow = { episode: PodcastEpisode; offset: number };

function durationLabel(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

function dateLabel(value: string | number | null): string {
  if (value == null) return "";
  const parsed = typeof value === "number"
    ? new Date(value > 1_000_000_000_000 ? value : value * 1000)
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("sv-SE", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function Artwork({ image, name, small = false }: { image: string | null; name: string; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [image]);
  const className = small ? "podcast-artwork podcast-artwork-small" : "podcast-artwork";
  return image && !failed
    ? <img className={className} src={image} alt="" onError={() => setFailed(true)} />
    : <div className={`${className} podcast-artwork-placeholder`} role="img" aria-label={`Omslag saknas för ${name}`}>🎙</div>;
}

export default function PodcastsView({
  player,
  queueContext,
  onChanged,
  localMode = false,
  localHistory = [],
  onLocalPlay,
  onLocalResume,
}: {
  player: Player | null;
  queueContext: QueueContext | null;
  onChanged: () => Promise<void>;
  localMode?: boolean;
  localHistory?: LocalEpisodeRecord[];
  onLocalPlay?: (podcast: Podcast, episode: PodcastEpisode, offset: number) => void;
  onLocalResume?: (entry: LocalEpisodeRecord) => void;
}) {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [inProgress, setInProgress] = useState<PodcastEpisode[]>([]);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Podcast | null>(null);
  const [rows, setRows] = useState<EpisodeRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [busyUri, setBusyUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    try {
      const items = await getPodcasts();
      setPodcasts(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte läsa podcasts");
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => { void loadLibrary(); }, [loadLibrary]);

  const refreshProgress = useCallback(async () => {
    try {
      setInProgress(await getPodcastInProgress());
      setProgressError(null);
    } catch {
      setProgressError("Kunde inte läsa lyssningshistoriken från Music Assistant.");
    }
  }, []);

  useEffect(() => {
    void refreshProgress();
    const interval = window.setInterval(() => void refreshProgress(), 45000);
    return () => window.clearInterval(interval);
  }, [refreshProgress]);

  const openPodcast = async (podcast: Podcast) => {
    setSelected(podcast);
    setRows([]);
    setHasMore(false);
    setError(null);
    setLoadingEpisodes(true);
    try {
      const data = await getPodcastEpisodes(podcast.id, 0);
      setRows(data.episodes.map((episode) => ({ episode, offset: 0 })));
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte läsa avsnitten");
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const loadMore = async () => {
    if (!selected || loadingEpisodes || !hasMore) return;
    const nextOffset = rows.length;
    setLoadingEpisodes(true);
    setError(null);
    try {
      const data = await getPodcastEpisodes(selected.id, nextOffset);
      setRows((current) => [
        ...current,
        ...data.episodes.map((episode) => ({ episode, offset: nextOffset })),
      ]);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte läsa fler avsnitt");
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const startEpisode = async (entry: EpisodeRow) => {
    if (!selected || busyUri) return;
    if (localMode) {
      onLocalPlay?.(selected, entry.episode, entry.offset);
      return;
    }
    if (!player) return;
    setBusyUri(entry.episode.uri);
    setError(null);
    try {
      await playPodcastEpisode(selected.id, player.id, entry.episode.uri, entry.offset);
      await onChanged();
      void refreshProgress();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spela avsnittet");
    } finally {
      setBusyUri(null);
    }
  };

  const resumeEpisode = async (episode: PodcastEpisode) => {
    if (busyUri || !player) return;
    setBusyUri(episode.uri);
    setError(null);
    try {
      await resumePodcastEpisode(player.id, episode.uri);
      await onChanged();
      void refreshProgress();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte fortsätta avsnittet");
    } finally {
      setBusyUri(null);
    }
  };

  const podcastPlaying = !localMode && player?.nowPlaying?.mediaType === "podcast_episode";

  return (
    <div className="podcasts-view">
      {podcastPlaying && player && (
        <div className="podcast-player-section">
          <PlayerCard player={player} queueContext={queueContext} onChanged={onChanged} />
        </div>
      )}

      <div className="podcast-heading">
        <div>
          <p className="eyebrow">Podcasts</p>
          <h2>{selected ? selected.name : "Mina podcasts"}</h2>
          <p>{selected ? selected.publisher ?? "Avsnitt i ditt bibliotek" : "Poddarna du lagt till i Music Assistant"}</p>
        </div>
        {selected ? (
          <button type="button" className="podcast-secondary" onClick={() => {
            setSelected(null); setRows([]); setHasMore(false); setError(null);
          }}>← Alla podcasts</button>
        ) : (
          <button type="button" className="podcast-secondary" disabled={loadingLibrary} onClick={() => void loadLibrary()}>↻ Uppdatera</button>
        )}
      </div>

      {error && <div role="alert" className="message error">{error}</div>}

      {!selected && (
        <>
          {localMode && localHistory.some((episode) => !episode.completed && episode.position > 0) && (
            <section className="podcast-continue" aria-label="Fortsätt lyssna på den här enheten">
              <h3>Fortsätt lyssna här</h3>
              <p className="podcast-local-hint">Lyssningspositionerna sparas bara i den här webbläsaren.</p>
              <div className="podcast-continue-list">
                {localHistory.filter((episode) => !episode.completed && episode.position > 0).map((episode) => (
                  <article className="podcast-continue-item" key={episode.uri}>
                    <Artwork image={episode.image ?? null} name={episode.title} small />
                    <div className="podcast-episode-info">
                      <strong>{episode.title}</strong>
                      <small>{episode.subtitle ?? "Podcast"}</small>
                      <small>Lyssnat {durationLabel(episode.position)}</small>
                    </div>
                    <button type="button" className="podcast-resume-button" onClick={() => onLocalResume?.(episode)}>
                      ▶ Fortsätt
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          {!localMode && inProgress.length > 0 && (
            <section className="podcast-continue" aria-label="Fortsätt lyssna">
              <h3>Fortsätt lyssna</h3>
              <div className="podcast-continue-list">
                {inProgress.map((episode) => (
                  <article className="podcast-continue-item" key={episode.uri}>
                    <Artwork image={episode.image} name={episode.title} small />
                    <div className="podcast-episode-info">
                      <strong>{episode.title}</strong>
                      {episode.podcastName && <small>{episode.podcastName}</small>}
                      {episode.resumePositionMs > 0 && (
                        <small>Lyssnat {durationLabel(episode.resumePositionMs / 1000)}
                        {episode.duration ? ` av ${durationLabel(episode.duration)}` : ""}</small>
                      )}
                    </div>
                    <button
                      type="button"
                      className="podcast-resume-button"
                      disabled={busyUri !== null}
                      onClick={() => void resumeEpisode(episode)}
                    >{busyUri === episode.uri ? "…" : "▶ Fortsätt"}</button>
                  </article>
                ))}
              </div>
            </section>
          )}
          {!localMode && progressError && <p className="podcast-subtle-warning">{progressError}</p>}
          {loadingLibrary && <div className="message">Läser podcastbiblioteket…</div>}
          {!loadingLibrary && podcasts.length === 0 && !error && (
            <div className="message">Inga podcasts finns i Music Assistants bibliotek ännu.</div>
          )}
          <div className="podcast-grid">
            {podcasts.map((podcast) => (
              <button
                type="button"
                key={podcast.id}
                className="podcast-card"
                onClick={() => void openPodcast(podcast)}
              >
                <Artwork image={podcast.image} name={podcast.name} />
                <span className="podcast-card-text">
                  <strong>{podcast.name}</strong>
                  <small>{podcast.publisher ?? "Podcast"}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {selected && (
        <>
          {rows.length === 0 && loadingEpisodes && <div className="message">Läser avsnitten…</div>}
          {rows.length === 0 && !loadingEpisodes && !error && (
            <div className="message">Inga avsnitt hittades för denna podcast.</div>
          )}

          <div className="podcast-episode-list" aria-label="Podcastavsnitt">
            {rows.map((entry) => {
              const progressEntry = localMode
                ? localHistory.find((item) => item.uri === entry.episode.uri)
                : inProgress.find((item) => item.uri === entry.episode.uri);
              const listenedMs = localMode
                ? ((progressEntry as LocalEpisodeRecord | undefined)?.position ?? 0) * 1000
                : Math.max(entry.episode.resumePositionMs, (progressEntry as PodcastEpisode | undefined)?.resumePositionMs ?? 0);
              const fullyPlayed = localMode
                ? (progressEntry as LocalEpisodeRecord | undefined)?.completed === true
                : entry.episode.fullyPlayed;
              const durationMs = (entry.episode.duration ?? 0) * 1000;
              return (
              <article className="podcast-episode" key={entry.episode.uri}>
                <Artwork image={entry.episode.image ?? selected.image} name={entry.episode.title} small />
                <div className="podcast-episode-info">
                  <h3>{entry.episode.title}</h3>
                  <p className="podcast-episode-meta">
                    {dateLabel(entry.episode.publishedAt)}
                    {entry.episode.duration ? ` · ${durationLabel(entry.episode.duration)}` : ""}
                  </p>
                  {(fullyPlayed || listenedMs > 0) && (
                    <div className="podcast-episode-progress">
                      <span>{fullyPlayed ? "✓ Lyssnad" : `Fortsätt från ${durationLabel(listenedMs / 1000)}`}</span>
                      {durationMs > 0 && (
                        <div className="podcast-episode-progress-track">
                          <div style={{ width: `${fullyPlayed ? 100 : Math.min(100, listenedMs / durationMs * 100)}%` }} />
                        </div>
                      )}
                    </div>
                  )}
                  {entry.episode.description && (
                    <p className="podcast-episode-description">{entry.episode.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="podcast-play-button"
                  disabled={busyUri !== null || loadingEpisodes}
                  aria-label={`${listenedMs > 0 && !fullyPlayed ? "Fortsätt" : "Spela"} ${entry.episode.title}`}
                  onClick={() => void startEpisode(entry)}
                >
                  {busyUri === entry.episode.uri ? "…" : "▶"}
                </button>
              </article>
              );
            })}
          </div>
          {hasMore && (
            <button
              type="button"
              className="podcast-load-more"
              disabled={loadingEpisodes}
              onClick={() => void loadMore()}
            >
              {loadingEpisodes ? "Läser…" : "Visa fler avsnitt"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import {
  getMusicPlaylist,
  getMusicPlaylists,
  playMusicPlaylist,
  playMusicTrack,
  type MusicPlaylist,
  type MusicPlaylistDetail,
  type MusicTrack,
  type Player,
  type QueueContext,
} from "../api";
import PlayerCard from "../player/PlayerCard";
import "./music.css";

type MusicPage =
  | { kind: "home" }
  | { kind: "playlists" }
  | { kind: "playlist"; playlistId: string };

function formatDuration(value: number | null) {
  if (!value || !Number.isFinite(value)) {
    return "";
  }

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function PlaylistArtwork({ playlist }: { playlist: MusicPlaylist }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [playlist.image]);

  if (playlist.image && !imageFailed) {
    return (
      <img
        className="music-playlist-artwork"
        src={playlist.image}
        alt=""
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className="music-playlist-artwork music-artwork-placeholder" aria-hidden="true">
      ♫
    </div>
  );
}

function TrackRow({
  track,
  index,
  busy,
  onPlay,
}: {
  track: MusicTrack;
  index: number;
  busy: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      className="music-track-row"
      disabled={busy}
      onClick={onPlay}
      aria-label={`Spela ${track.title}`}
    >
      <span className="music-track-number">{track.position ?? index + 1}</span>
      <span className="music-track-text">
        <strong>{track.title}</strong>
        <small>{track.artist ?? track.album ?? ""}</small>
      </span>
      <span className="music-track-duration">{formatDuration(track.duration)}</span>
      <span className="music-track-play" aria-hidden="true">▶</span>
    </button>
  );
}

export default function MusicView({
  player,
  queueContext,
  radioIsActive,
  onChanged,
}: {
  player: Player;
  queueContext: QueueContext | null;
  radioIsActive: boolean;
  onChanged: () => Promise<void>;
}) {
  const [page, setPage] = useState<MusicPage>({ kind: "home" });
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [playlistsLoaded, setPlaylistsLoaded] = useState(false);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [playlistDetail, setPlaylistDetail] = useState<MusicPlaylistDetail | null>(null);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPlaylists = useCallback(async (force = false) => {
    if (playlistsLoading || (playlistsLoaded && !force)) {
      return;
    }

    setPlaylistsLoading(true);
    setError(null);
    try {
      setPlaylists(await getMusicPlaylists());
      setPlaylistsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte läsa spellistorna");
    } finally {
      setPlaylistsLoading(false);
    }
  }, [playlistsLoaded, playlistsLoading]);

  const showPlaylists = () => {
    setPage({ kind: "playlists" });
    void loadPlaylists();
  };

  const openPlaylist = async (playlist: MusicPlaylist) => {
    setPage({ kind: "playlist", playlistId: playlist.id });
    setPlaylistDetail(null);
    setPlaylistLoading(true);
    setError(null);

    try {
      setPlaylistDetail(await getMusicPlaylist(playlist.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte läsa spellistan");
    } finally {
      setPlaylistLoading(false);
    }
  };

  const startPlaylist = async (shuffle: boolean) => {
    const playlist = playlistDetail?.playlist;
    if (!playlist || busyAction) {
      return;
    }

    setBusyAction(shuffle ? "shuffle" : "playlist");
    setError(null);
    try {
      await playMusicPlaylist(player.id, playlist.id, shuffle);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte starta spellistan");
    } finally {
      setBusyAction(null);
    }
  };

  const startTrack = async (track: MusicTrack) => {
    const playlist = playlistDetail?.playlist;
    if (!playlist || busyAction) {
      return;
    }

    setBusyAction(track.uri);
    setError(null);
    try {
      await playMusicTrack(player.id, playlist.id, track.uri);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte starta låten");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="music-view-layout">
      {radioIsActive ? (
        <div className="view-empty-state music-radio-notice">
          <span className="view-empty-icon" aria-hidden="true">●</span>
          <div>
            <strong>Radio spelar just nu</strong>
            <p>Välj musik nedan för att ersätta radion på {player.name}.</p>
          </div>
        </div>
      ) : (
        <PlayerCard player={player} queueContext={queueContext} onChanged={onChanged} />
      )}

      <section className="music-browser" aria-label="Välj musik">
        {error && <div className="message error music-message">{error}</div>}

        {page.kind === "home" && (
          <>
            <div className="music-browser-heading">
              <div>
                <p className="eyebrow">Bibliotek</p>
                <h2>Vad vill du lyssna på?</h2>
              </div>
            </div>

            <label className="music-search-disabled" title="Sök byggs i Sprint 5C">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                placeholder="Sök efter artist, album eller låt…"
                disabled
                aria-label="Sök kommer i en senare del av Sprint 5"
              />
              <small>kommer snart</small>
            </label>

            <div className="music-home-actions">
              <button
                type="button"
                className="music-home-card music-home-card-disabled"
                disabled
                title="Favoriter byggs i Sprint 5B"
              >
                <span className="music-home-icon" aria-hidden="true">♥</span>
                <span>
                  <strong>Favoriter</strong>
                  <small>Låtar, album och artister</small>
                </span>
                <em>Nästa steg</em>
              </button>

              <button type="button" className="music-home-card" onClick={showPlaylists}>
                <span className="music-home-icon" aria-hidden="true">♫</span>
                <span>
                  <strong>Spellistor</strong>
                  <small>Dina spellistor i Music Assistant</small>
                </span>
                <span className="music-home-arrow" aria-hidden="true">›</span>
              </button>
            </div>
          </>
        )}

        {page.kind === "playlists" && (
          <>
            <div className="music-browser-heading music-browser-heading-actions">
              <div>
                <button
                  type="button"
                  className="music-back-button"
                  onClick={() => setPage({ kind: "home" })}
                >
                  ← Musik
                </button>
                <h2>Spellistor</h2>
                <p>{playlistsLoaded ? `${playlists.length} spellistor` : "Music Assistant"}</p>
              </div>
              <button
                type="button"
                className="music-refresh-button"
                disabled={playlistsLoading}
                onClick={() => void loadPlaylists(true)}
              >
                ↻ Uppdatera
              </button>
            </div>

            {playlistsLoading && !playlistsLoaded && (
              <div className="message music-message">Läser spellistor…</div>
            )}

            {!playlistsLoading && playlistsLoaded && playlists.length === 0 && (
              <div className="music-empty-library">
                <strong>Inga spellistor hittades</strong>
                <p>Lägg till spellistor i Music Assistant så visas de här.</p>
              </div>
            )}

            <div className="music-playlist-grid">
              {playlists.map((playlist) => (
                <button
                  type="button"
                  className="music-playlist-card"
                  key={playlist.id}
                  onClick={() => void openPlaylist(playlist)}
                >
                  <PlaylistArtwork playlist={playlist} />
                  <span className="music-playlist-card-text">
                    <strong>{playlist.name}</strong>
                    <small>{playlist.favorite ? "♥ Favorit" : "Spellista"}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {page.kind === "playlist" && (
          <>
            <div className="music-browser-heading">
              <button type="button" className="music-back-button" onClick={showPlaylists}>
                ← Spellistor
              </button>
            </div>

            {playlistLoading && (
              <div className="message music-message">Läser spellista…</div>
            )}

            {!playlistLoading && playlistDetail && (
              <>
                <header className="music-playlist-header">
                  <PlaylistArtwork playlist={playlistDetail.playlist} />
                  <div>
                    <p className="eyebrow">Spellista</p>
                    <h2>{playlistDetail.playlist.name}</h2>
                    <p>{playlistDetail.tracks.length} låtar</p>
                    <div className="music-playlist-actions">
                      <button
                        type="button"
                        className="music-primary-action"
                        disabled={busyAction !== null}
                        onClick={() => void startPlaylist(false)}
                      >
                        ▶ Spela
                      </button>
                      <button
                        type="button"
                        className="music-secondary-action"
                        disabled={busyAction !== null}
                        onClick={() => void startPlaylist(true)}
                      >
                        ⇄ Blanda
                      </button>
                    </div>
                  </div>
                </header>

                <div className="music-track-list" aria-label={`Låtar i ${playlistDetail.playlist.name}`}>
                  {playlistDetail.tracks.map((track, index) => (
                    <TrackRow
                      key={`${track.id}-${track.uri}-${index}`}
                      track={track}
                      index={index}
                      busy={busyAction !== null}
                      onPlay={() => void startTrack(track)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

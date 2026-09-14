import { useEffect, useRef, useState } from "react";
import {
  playMusicFavorite,
  type MusicAlbum,
  type MusicTrack,
  type Player,
} from "../api";
import {
  getFavoriteAlbum,
  playFavoriteAlbumFromTrack,
  type FavoriteAlbumDetail,
} from "./favoriteAlbumApi";
import "./album-dialog.css";

function formatDuration(value: number | null) {
  if (!value || !Number.isFinite(value)) {
    return "";
  }

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function AlbumArtwork({ album }: { album: MusicAlbum }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [album.image]);

  if (album.image && !imageFailed) {
    return (
      <img
        className="album-dialog-artwork"
        src={album.image}
        alt=""
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className="album-dialog-artwork album-dialog-artwork-placeholder" aria-hidden="true">
      ♫
    </div>
  );
}

function AlbumTrackRow({
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
      className="album-dialog-track"
      disabled={busy}
      onClick={onPlay}
      aria-label={`Spela från ${track.title}`}
    >
      <span className="album-dialog-track-number">{index + 1}</span>
      <span className="album-dialog-track-text">
        <strong>{track.title}</strong>
        <small>{track.artist ?? ""}</small>
      </span>
      <span className="album-dialog-track-duration">{formatDuration(track.duration)}</span>
      <span className="album-dialog-track-play" aria-hidden="true">▶</span>
    </button>
  );
}

export default function FavoriteAlbumDialog({
  album,
  player,
  onClose,
  onChanged,
}: {
  album: MusicAlbum;
  player: Player;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<FavoriteAlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setDetail(null);
    setError(null);

    void getFavoriteAlbum(album.id)
      .then((nextDetail) => {
        if (!cancelled) {
          setDetail(nextDetail);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Kunde inte läsa albumet");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [album.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busyAction === null) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busyAction, onClose]);

  const playAlbum = async (shuffle: boolean) => {
    if (busyAction) {
      return;
    }

    setBusyAction(shuffle ? "shuffle" : "album");
    setError(null);
    try {
      await playMusicFavorite(player.id, "album", album.id, shuffle);
      await onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte starta albumet");
    } finally {
      setBusyAction(null);
    }
  };

  const playFromTrack = async (track: MusicTrack) => {
    if (busyAction) {
      return;
    }

    setBusyAction(track.uri);
    setError(null);
    try {
      await playFavoriteAlbumFromTrack(player.id, album.id, track.uri);
      await onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte starta låten");
    } finally {
      setBusyAction(null);
    }
  };

  const shownAlbum = detail?.album ?? album;
  const subtitle = [shownAlbum.artist, shownAlbum.year].filter(Boolean).join(" · ");

  return (
    <div
      className="album-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && busyAction === null) {
          onClose();
        }
      }}
    >
      <section
        className="album-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="favorite-album-dialog-title"
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="album-dialog-close"
          onClick={onClose}
          disabled={busyAction !== null}
          aria-label="Stäng albumet"
        >
          ×
        </button>

        <header className="album-dialog-header">
          <AlbumArtwork album={shownAlbum} />
          <div className="album-dialog-heading">
            <p className="eyebrow">Album</p>
            <h2 id="favorite-album-dialog-title">{shownAlbum.name}</h2>
            {subtitle && <p>{subtitle}</p>}
            {detail && <p>{detail.tracks.length} låtar</p>}
            <div className="album-dialog-actions">
              <button
                type="button"
                className="music-primary-action"
                disabled={busyAction !== null}
                onClick={() => void playAlbum(false)}
              >
                ▶ Spela album
              </button>
              <button
                type="button"
                className="music-secondary-action"
                disabled={busyAction !== null}
                onClick={() => void playAlbum(true)}
              >
                ⇄ Blanda
              </button>
            </div>
          </div>
        </header>

        {error && <div className="message error album-dialog-message">{error}</div>}
        {loading && <div className="message album-dialog-message">Läser albumets låtar…</div>}

        {!loading && detail && detail.tracks.length === 0 && (
          <div className="music-empty-library album-dialog-empty">
            <strong>Inga låtar hittades</strong>
            <p>Music Assistant returnerade ingen låtlista för albumet.</p>
          </div>
        )}

        {detail && detail.tracks.length > 0 && (
          <div className="album-dialog-track-list" aria-label={`Låtar på ${shownAlbum.name}`}>
            {detail.tracks.map((track, index) => (
              <AlbumTrackRow
                key={`${track.id}-${track.uri}-${index}`}
                track={track}
                index={index}
                busy={busyAction !== null}
                onPlay={() => void playFromTrack(track)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

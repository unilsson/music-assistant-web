import { useEffect, useMemo, useState } from "react";
import {
  favoriteMusicAlbum,
  getMusicAlbum,
  playMusicAlbum,
  type MusicAlbum,
  type MusicArtist,
  type MusicTrack,
  type Player,
} from "../api";
import "./media-detail.css";

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
        className="media-detail-artwork"
        src={album.image}
        alt=""
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className="media-detail-artwork media-detail-artwork-placeholder" aria-hidden="true">
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
      className="media-detail-track-row"
      disabled={busy}
      onClick={onPlay}
      aria-label={`Spela albumet från ${track.title}`}
    >
      <span className="media-detail-track-number">{track.position ?? index + 1}</span>
      <span className="media-detail-track-text">
        <strong>{track.title}</strong>
        <small>{track.artist ?? ""}</small>
      </span>
      <span className="media-detail-track-duration">{formatDuration(track.duration)}</span>
      <span className="media-detail-track-play" aria-hidden="true">▶</span>
    </button>
  );
}

export default function AlbumView({
  album,
  player,
  onBack,
  onOpenArtist,
  onChanged,
}: {
  album: MusicAlbum;
  player: Player;
  onBack: () => void;
  onOpenArtist: (artist: MusicArtist) => void;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<{ album: MusicAlbum; tracks: MusicTrack[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favorite, setFavorite] = useState(album.favorite === true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setFavorite(album.favorite === true);
    setError(null);

    void getMusicAlbum(album.uri)
      .then((nextDetail) => {
        if (!cancelled) {
          setDetail(nextDetail);
          setFavorite(nextDetail.album.favorite === true);
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
  }, [album.uri]);

  const shownAlbum = detail?.album ?? album;
  const primaryArtist = useMemo(() => shownAlbum.artists[0] ?? null, [shownAlbum.artists]);
  const subtitle = [shownAlbum.artist, shownAlbum.year].filter(Boolean).join(" · ");

  const playAlbum = async (shuffle: boolean, trackUri?: string) => {
    if (busyAction) {
      return;
    }

    setBusyAction(trackUri ?? (shuffle ? "shuffle" : "album"));
    setError(null);
    try {
      await playMusicAlbum(player.id, shownAlbum.uri, shuffle, trackUri);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte starta albumet");
    } finally {
      setBusyAction(null);
    }
  };

  const addFavorite = async () => {
    if (favorite || favoriteBusy) {
      return;
    }

    setFavoriteBusy(true);
    setError(null);
    try {
      await favoriteMusicAlbum(shownAlbum.uri);
      setFavorite(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte lägga till albumet i favoriter");
    } finally {
      setFavoriteBusy(false);
    }
  };

  const openPrimaryArtist = () => {
    if (!primaryArtist?.uri) {
      return;
    }

    onOpenArtist({
      id: primaryArtist.id ?? primaryArtist.uri,
      uri: primaryArtist.uri,
      name: primaryArtist.name,
      image: null,
      provider: null,
    });
  };

  return (
    <>
      <div className="music-browser-heading">
        <button type="button" className="music-back-button" onClick={onBack}>
          ← Tillbaka
        </button>
      </div>

      {error && <div className="message error music-message">{error}</div>}

      <header className="media-detail-header">
        <AlbumArtwork album={shownAlbum} />
        <div className="media-detail-heading">
          <p className="eyebrow">Album</p>
          <h2>{shownAlbum.name}</h2>
          {subtitle && <p>{subtitle}</p>}
          {primaryArtist?.uri && (
            <button type="button" className="media-detail-link" onClick={openPrimaryArtist}>
              Visa {primaryArtist.name}
            </button>
          )}
          {detail && <p>{detail.tracks.length} låtar</p>}
          <div className="media-detail-actions">
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
            <button
              type="button"
              className={`music-secondary-action media-detail-favorite-action${favorite ? " media-detail-favorite-active" : ""}`}
              disabled={favorite || favoriteBusy}
              onClick={() => void addFavorite()}
            >
              {favorite ? "♥ Favorit" : favoriteBusy ? "♡ Sparar…" : "♡ Lägg till i favoriter"}
            </button>
          </div>
        </div>
      </header>

      {loading && <div className="message music-message">Läser albumets låtar…</div>}

      {!loading && detail && detail.tracks.length === 0 && (
        <div className="music-empty-library">
          <strong>Inga låtar hittades</strong>
          <p>Music Assistant returnerade ingen låtlista för albumet.</p>
        </div>
      )}

      {detail && detail.tracks.length > 0 && (
        <div className="media-detail-track-list" aria-label={`Låtar på ${shownAlbum.name}`}>
          {detail.tracks.map((track, index) => (
            <AlbumTrackRow
              key={`${track.id}-${track.uri}-${index}`}
              track={track}
              index={index}
              busy={busyAction !== null}
              onPlay={() => void playAlbum(false, track.uri)}
            />
          ))}
        </div>
      )}
    </>
  );
}

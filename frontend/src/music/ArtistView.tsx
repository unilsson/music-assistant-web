import { useEffect, useState } from "react";
import {
  getMusicArtist,
  playMusicArtist,
  playMusicArtistTrack,
  type MusicAlbum,
  type MusicArtist,
  type MusicTrack,
  type Player,
} from "../api";
import FavoriteButton from "./FavoriteButton";
import "./media-detail.css";

function ArtistArtwork({ artist }: { artist: MusicArtist }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [artist.image]);

  if (artist.image && !imageFailed) {
    return (
      <img
        className="media-detail-artwork media-detail-artist-artwork"
        src={artist.image}
        alt=""
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div
      className="media-detail-artwork media-detail-artwork-placeholder media-detail-artist-artwork"
      aria-hidden="true"
    >
      ♫
    </div>
  );
}

function AlbumArtwork({ album }: { album: MusicAlbum }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [album.image]);

  if (album.image && !imageFailed) {
    return <img className="media-detail-card-artwork" src={album.image} alt="" onError={() => setImageFailed(true)} />;
  }

  return (
    <span className="media-detail-card-artwork media-detail-artwork-placeholder" aria-hidden="true">
      ♫
    </span>
  );
}

function ArtistTrackRow({
  track,
  busy,
  onPlay,
  onFavoriteError,
}: {
  track: MusicTrack;
  busy: boolean;
  onPlay: () => void;
  onFavoriteError: (message: string) => void;
}) {
  return (
    <div className="media-detail-track-item">
      <button
        type="button"
        className="media-detail-track-main"
        disabled={busy}
        onClick={onPlay}
        aria-label={`Spela ${track.title}`}
      >
        <span className="media-detail-track-number">♪</span>
        <span className="media-detail-track-text">
          <strong>{track.title}</strong>
          <small>{track.album ?? track.artist ?? ""}</small>
        </span>
        <span className="media-detail-track-duration"></span>
        <span className="media-detail-track-play" aria-hidden="true">▶</span>
      </button>
      <FavoriteButton
        kind="track"
        uri={track.uri}
        favorite={track.favorite}
        compact
        disabled={busy}
        onError={onFavoriteError}
      />
    </div>
  );
}

export default function ArtistView({
  artist,
  player,
  onBack,
  onOpenAlbum,
  onChanged,
}: {
  artist: MusicArtist;
  player: Player;
  onBack: () => void;
  onOpenAlbum: (album: MusicAlbum) => void;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<{
    artist: MusicArtist;
    albums: MusicAlbum[];
    tracks: MusicTrack[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setError(null);

    void getMusicArtist(artist.uri)
      .then((nextDetail) => {
        if (!cancelled) {
          setDetail(nextDetail);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Kunde inte läsa artisten");
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
  }, [artist.uri]);

  const shownArtist = detail?.artist ?? artist;

  const playArtist = async (shuffle: boolean) => {
    if (busyAction) {
      return;
    }

    setBusyAction(shuffle ? "shuffle" : "artist");
    setError(null);
    try {
      await playMusicArtist(player.id, shownArtist.uri, shuffle);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte starta artisten");
    } finally {
      setBusyAction(null);
    }
  };

  const playTrack = async (track: MusicTrack) => {
    if (busyAction) {
      return;
    }

    setBusyAction(track.uri);
    setError(null);
    try {
      await playMusicArtistTrack(player.id, shownArtist.uri, track.uri);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte starta låten");
    } finally {
      setBusyAction(null);
    }
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
        <ArtistArtwork artist={shownArtist} />
        <div className="media-detail-heading">
          <p className="eyebrow">Artist</p>
          <h2>{shownArtist.name}</h2>
          {detail && (
            <p>
              {detail.albums.length} album
              {detail.tracks.length > 0 ? ` · ${detail.tracks.length} utvalda låtar` : ""}
            </p>
          )}
          <div className="media-detail-actions">
            <button
              type="button"
              className="music-primary-action"
              disabled={busyAction !== null}
              onClick={() => void playArtist(false)}
            >
              ▶ Spela artist
            </button>
            <button
              type="button"
              className="music-secondary-action"
              disabled={busyAction !== null}
              onClick={() => void playArtist(true)}
            >
              ⇄ Blanda
            </button>
            <FavoriteButton
              kind="artist"
              uri={shownArtist.uri}
              favorite={shownArtist.favorite}
              disabled={busyAction !== null}
              onError={(message) => setError(message)}
            />
          </div>
        </div>
      </header>

      {loading && <div className="message music-message">Läser artist…</div>}

      {!loading && detail && detail.albums.length === 0 && detail.tracks.length === 0 && (
        <div className="music-empty-library">
          <strong>Ingen kataloginformation hittades</strong>
          <p>Music Assistant returnerade inga album eller låtar för artisten.</p>
        </div>
      )}

      {detail && detail.albums.length > 0 && (
        <section className="media-detail-section" aria-labelledby="artist-albums-heading">
          <div className="media-detail-section-heading">
            <h3 id="artist-albums-heading">Album</h3>
            <span>{detail.albums.length}</span>
          </div>
          <div className="media-detail-card-grid">
            {detail.albums.map((album) => (
              <button
                type="button"
                className="media-detail-card"
                key={`${album.provider ?? "provider"}-${album.id}-${album.uri}`}
                onClick={() => onOpenAlbum(album)}
                aria-label={`Öppna albumet ${album.name}`}
              >
                <AlbumArtwork album={album} />
                <span className="media-detail-card-text">
                  <strong>{album.name}</strong>
                  <small>{album.year ?? "Album"}</small>
                </span>
                <span className="media-detail-card-open" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {detail && detail.tracks.length > 0 && (
        <section className="media-detail-section" aria-labelledby="artist-tracks-heading">
          <div className="media-detail-section-heading">
            <h3 id="artist-tracks-heading">Utvalda låtar</h3>
            <span>{detail.tracks.length}</span>
          </div>
          <div className="media-detail-track-list">
            {detail.tracks.map((track) => (
              <ArtistTrackRow
                key={`${track.provider ?? "provider"}-${track.id}-${track.uri}`}
                track={track}
                busy={busyAction !== null}
                onPlay={() => void playTrack(track)}
                onFavoriteError={(message) => setError(message)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

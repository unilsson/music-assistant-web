import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMusicFavorites,
  playMusicFavorite,
  type FavoriteKind,
  type MusicAlbum,
  type MusicArtist,
  type MusicFavorites,
  type MusicPlaylist,
  type MusicTrack,
  type Player,
} from "../api";

type FavoriteArtworkProps = {
  image: string | null;
  className?: string;
  round?: boolean;
};

function FavoriteArtwork({ image, className = "", round = false }: FavoriteArtworkProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [image]);

  const classes = [
    "favorite-artwork",
    round ? "favorite-artwork-round" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (image && !imageFailed) {
    return <img className={classes} src={image} alt="" onError={() => setImageFailed(true)} />;
  }

  return (
    <span className={`${classes} favorite-artwork-placeholder`} aria-hidden="true">
      ♫
    </span>
  );
}

function FavoriteTrackRow({
  track,
  busy,
  onPlay,
}: {
  track: MusicTrack;
  busy: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      className="favorite-track-row"
      disabled={busy}
      onClick={onPlay}
      aria-label={`Spela ${track.title}`}
    >
      <FavoriteArtwork image={track.image} className="favorite-track-artwork" />
      <span className="favorite-track-text">
        <strong>{track.title}</strong>
        <small>{[track.artist, track.album].filter(Boolean).join(" · ")}</small>
      </span>
      <span className="favorite-play-indicator" aria-hidden="true">▶</span>
    </button>
  );
}

function FavoriteAlbumCard({
  album,
  busy,
  onPlay,
}: {
  album: MusicAlbum;
  busy: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      className="favorite-media-card"
      disabled={busy}
      onClick={onPlay}
      aria-label={`Spela albumet ${album.name}`}
    >
      <FavoriteArtwork image={album.image} />
      <span className="favorite-media-card-text">
        <strong>{album.name}</strong>
        <small>{[album.artist, album.year].filter(Boolean).join(" · ")}</small>
      </span>
      <span className="favorite-card-play" aria-hidden="true">▶</span>
    </button>
  );
}

function FavoriteArtistCard({
  artist,
  busy,
  onPlay,
}: {
  artist: MusicArtist;
  busy: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      className="favorite-media-card favorite-artist-card"
      disabled={busy}
      onClick={onPlay}
      aria-label={`Spela ${artist.name}`}
    >
      <FavoriteArtwork image={artist.image} round />
      <span className="favorite-media-card-text">
        <strong>{artist.name}</strong>
        <small>Artist</small>
      </span>
      <span className="favorite-card-play" aria-hidden="true">▶</span>
    </button>
  );
}

function FavoritePlaylistCard({
  playlist,
  onOpen,
}: {
  playlist: MusicPlaylist;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="favorite-media-card"
      onClick={onOpen}
      aria-label={`Öppna spellistan ${playlist.name}`}
    >
      <FavoriteArtwork image={playlist.image} />
      <span className="favorite-media-card-text">
        <strong>{playlist.name}</strong>
        <small>Spellista</small>
      </span>
      <span className="favorite-card-open" aria-hidden="true">›</span>
    </button>
  );
}

export default function FavoritesView({
  player,
  onBack,
  onOpenPlaylist,
  onChanged,
}: {
  player: Player;
  onBack: () => void;
  onOpenPlaylist: (playlist: MusicPlaylist) => void;
  onChanged: () => Promise<void>;
}) {
  const [favorites, setFavorites] = useState<MusicFavorites | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFavorites(await getMusicFavorites());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte läsa favoriterna");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  const total = useMemo(() => {
    if (!favorites) {
      return 0;
    }
    return (
      favorites.tracks.length +
      favorites.albums.length +
      favorites.artists.length +
      favorites.playlists.length
    );
  }, [favorites]);

  const playFavorite = async (kind: FavoriteKind, itemId: string, shuffle = false) => {
    if (busyKey) {
      return;
    }

    const key = `${kind}:${itemId}`;
    setBusyKey(key);
    setError(null);
    try {
      await playMusicFavorite(player.id, kind, itemId, shuffle);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte starta favoriten");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <>
      <div className="music-browser-heading music-browser-heading-actions">
        <div>
          <button type="button" className="music-back-button" onClick={onBack}>
            ← Musik
          </button>
          <h2>Favoriter</h2>
          <p>{favorites ? `${total} favoriter` : "Music Assistant"}</p>
        </div>
        <button
          type="button"
          className="music-refresh-button"
          disabled={loading}
          onClick={() => void loadFavorites()}
        >
          ↻ Uppdatera
        </button>
      </div>

      {error && <div className="message error music-message">{error}</div>}
      {loading && !favorites && <div className="message music-message">Läser favoriter…</div>}

      {!loading && favorites && total === 0 && (
        <div className="music-empty-library">
          <strong>Inga favoriter hittades</strong>
          <p>Markera musik som favorit i Music Assistant så visas den här.</p>
        </div>
      )}

      {favorites && favorites.tracks.length > 0 && (
        <section className="favorite-section" aria-labelledby="favorite-tracks-heading">
          <div className="favorite-section-heading">
            <h3 id="favorite-tracks-heading">Låtar</h3>
            <span>{favorites.tracks.length}</span>
          </div>
          <div className="favorite-track-list">
            {favorites.tracks.map((track) => (
              <FavoriteTrackRow
                key={`${track.id}-${track.uri}`}
                track={track}
                busy={busyKey !== null}
                onPlay={() => void playFavorite("track", track.id)}
              />
            ))}
          </div>
        </section>
      )}

      {favorites && favorites.albums.length > 0 && (
        <section className="favorite-section" aria-labelledby="favorite-albums-heading">
          <div className="favorite-section-heading">
            <h3 id="favorite-albums-heading">Album</h3>
            <span>{favorites.albums.length}</span>
          </div>
          <div className="favorite-media-grid">
            {favorites.albums.map((album) => (
              <FavoriteAlbumCard
                key={album.id}
                album={album}
                busy={busyKey !== null}
                onPlay={() => void playFavorite("album", album.id)}
              />
            ))}
          </div>
        </section>
      )}

      {favorites && favorites.artists.length > 0 && (
        <section className="favorite-section" aria-labelledby="favorite-artists-heading">
          <div className="favorite-section-heading">
            <h3 id="favorite-artists-heading">Artister</h3>
            <span>{favorites.artists.length}</span>
          </div>
          <div className="favorite-media-grid">
            {favorites.artists.map((artist) => (
              <FavoriteArtistCard
                key={artist.id}
                artist={artist}
                busy={busyKey !== null}
                onPlay={() => void playFavorite("artist", artist.id, true)}
              />
            ))}
          </div>
        </section>
      )}

      {favorites && favorites.playlists.length > 0 && (
        <section className="favorite-section" aria-labelledby="favorite-playlists-heading">
          <div className="favorite-section-heading">
            <h3 id="favorite-playlists-heading">Spellistor</h3>
            <span>{favorites.playlists.length}</span>
          </div>
          <div className="favorite-media-grid">
            {favorites.playlists.map((playlist) => (
              <FavoritePlaylistCard
                key={playlist.id}
                playlist={playlist}
                onOpen={() => onOpenPlaylist(playlist)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

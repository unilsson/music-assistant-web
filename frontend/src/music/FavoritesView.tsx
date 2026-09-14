import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMusicFavorites,
  playMusicFavorite,
  type FavoriteKind,
  type MusicAlbum,
  type MusicArtist,
  type MusicArtistRef,
  type MusicFavorites,
  type MusicPlaylist,
  type MusicTrack,
  type Player,
} from "../api";
import "./favorites.css";

type FavoriteArtworkProps = {
  image: string | null;
  className?: string;
  round?: boolean;
};

type FavoriteArtistGroup = {
  key: string;
  name: string;
  image: string | null;
  artist: MusicArtist | null;
  albums: MusicAlbum[];
  tracks: MusicTrack[];
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
        <small>{track.album ?? track.artist ?? ""}</small>
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
        <small>{album.year ?? "Album"}</small>
      </span>
      <span className="favorite-card-play" aria-hidden="true">▶</span>
    </button>
  );
}

function FavoriteArtistGroupCard({
  group,
  onOpen,
}: {
  group: FavoriteArtistGroup;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="favorite-media-card favorite-artist-card"
      onClick={onOpen}
      aria-label={`Öppna favoriter för ${group.name}`}
    >
      <FavoriteArtwork image={group.image} round />
      <span className="favorite-media-card-text">
        <strong>{group.name}</strong>
        <small>{favoriteArtistSummary(group)}</small>
      </span>
      <span className="favorite-card-open" aria-hidden="true">›</span>
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

function normalizedArtistName(name: string) {
  return name.trim().toLocaleLowerCase("sv-SE");
}

function refKey(ref: MusicArtistRef | null): string | null {
  if (!ref) {
    return null;
  }
  if (ref.id) {
    return `id:${ref.id}`;
  }
  if (ref.uri) {
    return `uri:${ref.uri}`;
  }
  return ref.name ? `name:${normalizedArtistName(ref.name)}` : null;
}

function artistKey(artist: MusicArtist) {
  return artist.id
    ? `id:${artist.id}`
    : artist.uri
      ? `uri:${artist.uri}`
      : `name:${normalizedArtistName(artist.name)}`;
}

function favoriteArtistSummary(group: FavoriteArtistGroup) {
  const parts: string[] = [];
  if (group.albums.length > 0) {
    parts.push(`${group.albums.length} album`);
  }
  if (group.tracks.length > 0) {
    parts.push(
      group.tracks.length === 1 ? "1 favoritlåt" : `${group.tracks.length} favoritlåtar`
    );
  }
  if (parts.length === 0 && group.artist) {
    return "Favoritartist";
  }
  return parts.join(" · ");
}

function groupFavoritesByArtist(favorites: MusicFavorites): FavoriteArtistGroup[] {
  const groups = new Map<string, FavoriteArtistGroup>();
  const nameAliases = new Map<string, string>();

  const ensureGroup = (
    key: string,
    name: string,
    image: string | null,
    artist: MusicArtist | null = null
  ) => {
    const existing = groups.get(key);
    if (existing) {
      if (!existing.image && image) {
        existing.image = image;
      }
      if (!existing.artist && artist) {
        existing.artist = artist;
      }
      return existing;
    }

    const group: FavoriteArtistGroup = {
      key,
      name,
      image,
      artist,
      albums: [],
      tracks: [],
    };
    groups.set(key, group);
    nameAliases.set(normalizedArtistName(name), key);
    return group;
  };

  for (const artist of favorites.artists) {
    ensureGroup(artistKey(artist), artist.name, artist.image, artist);
  }

  const groupForMedia = (
    artists: MusicArtistRef[],
    fallbackArtist: string | null,
    image: string | null
  ) => {
    const primary = artists[0] ?? null;
    const name = primary?.name ?? fallbackArtist?.trim() ?? "Okänd artist";
    const directKey = refKey(primary);
    const aliasKey = nameAliases.get(normalizedArtistName(name));
    const key = (directKey && groups.has(directKey) ? directKey : aliasKey) ??
      directKey ??
      `name:${normalizedArtistName(name)}`;
    return ensureGroup(key, name, image);
  };

  for (const album of favorites.albums) {
    const group = groupForMedia(album.artists, album.artist, album.image);
    group.albums.push(album);
  }

  for (const track of favorites.tracks) {
    const group = groupForMedia(track.artists, track.artist, track.image);
    group.tracks.push(track);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      albums: [...group.albums].sort((a, b) => {
        if (a.year && b.year && a.year !== b.year) {
          return a.year - b.year;
        }
        return a.name.localeCompare(b.name, "sv");
      }),
      tracks: [...group.tracks].sort((a, b) => a.title.localeCompare(b.title, "sv")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
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
  const [selectedArtistKey, setSelectedArtistKey] = useState<string | null>(null);
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

  const artistGroups = useMemo(
    () => (favorites ? groupFavoritesByArtist(favorites) : []),
    [favorites]
  );

  const selectedArtist = useMemo(
    () => artistGroups.find((group) => group.key === selectedArtistKey) ?? null,
    [artistGroups, selectedArtistKey]
  );

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

  if (selectedArtist) {
    return (
      <>
        <div className="music-browser-heading">
          <button
            type="button"
            className="music-back-button"
            onClick={() => setSelectedArtistKey(null)}
          >
            ← Favoriter
          </button>
        </div>

        {error && <div className="message error music-message">{error}</div>}

        <header className="favorite-artist-detail-header">
          <FavoriteArtwork
            image={selectedArtist.image}
            className="favorite-artist-detail-artwork"
            round
          />
          <div>
            <p className="eyebrow">Favoriter</p>
            <h2>{selectedArtist.name}</h2>
            <p>{favoriteArtistSummary(selectedArtist)}</p>
            {selectedArtist.artist && (
              <button
                type="button"
                className="music-primary-action"
                disabled={busyKey !== null}
                onClick={() =>
                  void playFavorite("artist", selectedArtist.artist!.id, true)
                }
              >
                ▶ Spela artist
              </button>
            )}
          </div>
        </header>

        {selectedArtist.albums.length > 0 && (
          <section className="favorite-section" aria-labelledby="favorite-artist-albums-heading">
            <div className="favorite-section-heading">
              <h3 id="favorite-artist-albums-heading">Album</h3>
              <span>{selectedArtist.albums.length}</span>
            </div>
            <div className="favorite-media-grid">
              {selectedArtist.albums.map((album) => (
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

        {selectedArtist.tracks.length > 0 && (
          <section className="favorite-section" aria-labelledby="favorite-artist-tracks-heading">
            <div className="favorite-section-heading">
              <h3 id="favorite-artist-tracks-heading">Favoritlåtar</h3>
              <span>{selectedArtist.tracks.length}</span>
            </div>
            <div className="favorite-track-list">
              {selectedArtist.tracks.map((track) => (
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
      </>
    );
  }

  return (
    <>
      <div className="music-browser-heading music-browser-heading-actions">
        <div>
          <button type="button" className="music-back-button" onClick={onBack}>
            ← Musik
          </button>
          <h2>Favoriter</h2>
          <p>
            {favorites
              ? `${artistGroups.length} artister · ${favorites.playlists.length} spellistor`
              : "Music Assistant"}
          </p>
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

      {artistGroups.length > 0 && (
        <section className="favorite-section" aria-labelledby="favorite-artists-heading">
          <div className="favorite-section-heading">
            <h3 id="favorite-artists-heading">Artister</h3>
            <span>{artistGroups.length}</span>
          </div>
          <div className="favorite-media-grid">
            {artistGroups.map((group) => (
              <FavoriteArtistGroupCard
                key={group.key}
                group={group}
                onOpen={() => setSelectedArtistKey(group.key)}
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

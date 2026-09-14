import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  playMusicSearchResult,
  searchMusic,
  type MusicAlbum,
  type MusicArtist,
  type MusicPlaylist,
  type MusicSearchResults,
  type MusicTrack,
  type Player,
  type SearchKind,
} from "../api";
import "./search.css";

type SearchArtworkProps = {
  image: string | null;
  className?: string;
  round?: boolean;
};

function SearchArtwork({ image, className = "", round = false }: SearchArtworkProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [image]);

  const classes = ["search-artwork", round ? "search-artwork-round" : "", className]
    .filter(Boolean)
    .join(" ");

  if (image && !imageFailed) {
    return <img className={classes} src={image} alt="" onError={() => setImageFailed(true)} />;
  }

  return (
    <span className={`${classes} search-artwork-placeholder`} aria-hidden="true">
      ♫
    </span>
  );
}

function SearchTrackRow({
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
      className="search-track-row"
      disabled={busy}
      onClick={onPlay}
      aria-label={`Spela ${track.title}`}
    >
      <SearchArtwork image={track.image} className="search-track-artwork" />
      <span className="search-track-text">
        <strong>{track.title}</strong>
        <small>{[track.artist, track.album].filter(Boolean).join(" · ")}</small>
      </span>
      <span className="search-play-indicator" aria-hidden="true">▶</span>
    </button>
  );
}

function SearchMediaCard({
  image,
  title,
  subtitle,
  round = false,
  busy,
  onPlay,
}: {
  image: string | null;
  title: string;
  subtitle: string;
  round?: boolean;
  busy: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      className={`search-media-card${round ? " search-artist-card" : ""}`}
      disabled={busy}
      onClick={onPlay}
      aria-label={`Spela ${title}`}
    >
      <SearchArtwork image={image} round={round} />
      <span className="search-media-card-text">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <span className="search-card-play" aria-hidden="true">▶</span>
    </button>
  );
}

export default function SearchView({
  player,
  initialQuery,
  onBack,
  onChanged,
}: {
  player: Player;
  initialQuery: string;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MusicSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const performSearch = useCallback(async (value: string) => {
    const nextQuery = value.trim();
    if (nextQuery.length < 2) {
      setError("Skriv minst två tecken för att söka.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextResults = await searchMusic(nextQuery);
      setQuery(nextQuery);
      setResults(nextResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sökningen misslyckades");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery.trim().length >= 2) {
      void performSearch(initialQuery);
    }
  }, [initialQuery, performSearch]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void performSearch(input);
  };

  const total = useMemo(() => {
    if (!results) {
      return 0;
    }
    return (
      results.tracks.length +
      results.albums.length +
      results.artists.length +
      results.playlists.length
    );
  }, [results]);

  const playResult = async (kind: SearchKind, uri: string, shuffle = false) => {
    if (!query || busyKey) {
      return;
    }

    const key = `${kind}:${uri}`;
    setBusyKey(key);
    setError(null);
    try {
      await playMusicSearchResult(player.id, query, kind, uri, shuffle);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte starta sökresultatet");
    } finally {
      setBusyKey(null);
    }
  };

  const albumSubtitle = (album: MusicAlbum) =>
    [album.artist, album.year].filter(Boolean).join(" · ") || "Album";

  const artistSubtitle = (_artist: MusicArtist) => "Artist";
  const playlistSubtitle = (_playlist: MusicPlaylist) => "Spellista";

  return (
    <>
      <div className="music-browser-heading search-heading">
        <button type="button" className="music-back-button" onClick={onBack}>
          ← Musik
        </button>
        <h2>Sök</h2>
        <p>Sök i Music Assistant och alla anslutna musiktjänster.</p>
      </div>

      <form className="music-search search-active" onSubmit={submit} role="search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Artist, album, låt eller spellista…"
          autoFocus
          autoComplete="off"
          aria-label="Sök efter musik"
        />
        <button type="submit" disabled={loading || input.trim().length < 2}>
          {loading ? "Söker…" : "Sök"}
        </button>
      </form>

      {error && <div className="message error music-message search-message">{error}</div>}

      {!results && !loading && !error && (
        <div className="search-intro">
          <span aria-hidden="true">⌕</span>
          <strong>Sök efter vad du vill lyssna på</strong>
          <p>Resultaten hämtas via Music Assistant, oavsett vilken musiktjänst de kommer från.</p>
        </div>
      )}

      {results && (
        <>
          <div className="search-summary">
            <strong>{query}</strong>
            <span>{total} träffar</span>
          </div>

          {total === 0 && (
            <div className="music-empty-library">
              <strong>Inga träffar</strong>
              <p>Prova ett annat artistnamn, album eller låttitel.</p>
            </div>
          )}

          {results.artists.length > 0 && (
            <section className="search-section" aria-labelledby="search-artists-heading">
              <div className="search-section-heading">
                <h3 id="search-artists-heading">Artister</h3>
                <span>{results.artists.length}</span>
              </div>
              <div className="search-media-grid">
                {results.artists.map((artist) => (
                  <SearchMediaCard
                    key={`${artist.provider ?? "provider"}-${artist.id}-${artist.uri}`}
                    image={artist.image}
                    title={artist.name}
                    subtitle={artistSubtitle(artist)}
                    round
                    busy={busyKey !== null}
                    onPlay={() => void playResult("artist", artist.uri, true)}
                  />
                ))}
              </div>
            </section>
          )}

          {results.albums.length > 0 && (
            <section className="search-section" aria-labelledby="search-albums-heading">
              <div className="search-section-heading">
                <h3 id="search-albums-heading">Album</h3>
                <span>{results.albums.length}</span>
              </div>
              <div className="search-media-grid">
                {results.albums.map((album) => (
                  <SearchMediaCard
                    key={`${album.provider ?? "provider"}-${album.id}-${album.uri}`}
                    image={album.image}
                    title={album.name}
                    subtitle={albumSubtitle(album)}
                    busy={busyKey !== null}
                    onPlay={() => void playResult("album", album.uri)}
                  />
                ))}
              </div>
            </section>
          )}

          {results.tracks.length > 0 && (
            <section className="search-section" aria-labelledby="search-tracks-heading">
              <div className="search-section-heading">
                <h3 id="search-tracks-heading">Låtar</h3>
                <span>{results.tracks.length}</span>
              </div>
              <div className="search-track-list">
                {results.tracks.map((track) => (
                  <SearchTrackRow
                    key={`${track.provider ?? "provider"}-${track.id}-${track.uri}`}
                    track={track}
                    busy={busyKey !== null}
                    onPlay={() => void playResult("track", track.uri)}
                  />
                ))}
              </div>
            </section>
          )}

          {results.playlists.length > 0 && (
            <section className="search-section" aria-labelledby="search-playlists-heading">
              <div className="search-section-heading">
                <h3 id="search-playlists-heading">Spellistor</h3>
                <span>{results.playlists.length}</span>
              </div>
              <div className="search-media-grid">
                {results.playlists.map((playlist) => (
                  <SearchMediaCard
                    key={`${playlist.provider ?? "provider"}-${playlist.id}-${playlist.uri}`}
                    image={playlist.image}
                    title={playlist.name}
                    subtitle={playlistSubtitle(playlist)}
                    busy={busyKey !== null}
                    onPlay={() => void playResult("playlist", playlist.uri)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

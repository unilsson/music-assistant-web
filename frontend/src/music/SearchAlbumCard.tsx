import { useEffect, useState } from "react";
import type { MusicAlbum } from "../api";
import { addSearchAlbumToFavorites } from "./searchFavoritesApi";
import "./search-album.css";

function AlbumArtwork({ album }: { album: MusicAlbum }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [album.image]);

  if (album.image && !imageFailed) {
    return (
      <img
        className="search-artwork"
        src={album.image}
        alt=""
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span className="search-artwork search-artwork-placeholder" aria-hidden="true">
      ♫
    </span>
  );
}

export default function SearchAlbumCard({
  album,
  query,
  busy,
  onPlay,
}: {
  album: MusicAlbum;
  query: string;
  busy: boolean;
  onPlay: () => void;
}) {
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteAdded, setFavoriteAdded] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  useEffect(() => {
    setFavoriteBusy(false);
    setFavoriteAdded(false);
    setFavoriteError(null);
  }, [album.uri, query]);

  const addFavorite = async () => {
    if (favoriteBusy || favoriteAdded) {
      return;
    }

    setFavoriteBusy(true);
    setFavoriteError(null);
    try {
      await addSearchAlbumToFavorites(query, album.uri);
      setFavoriteAdded(true);
    } catch (err) {
      setFavoriteError(err instanceof Error ? err.message : "Kunde inte lägga till albumet");
    } finally {
      setFavoriteBusy(false);
    }
  };

  const subtitle = [album.artist, album.year].filter(Boolean).join(" · ") || "Album";

  return (
    <article className="search-album-card">
      <button
        type="button"
        className="search-album-play"
        disabled={busy || favoriteBusy}
        onClick={onPlay}
        aria-label={`Spela albumet ${album.name}`}
      >
        <AlbumArtwork album={album} />
        <span className="search-media-card-text">
          <strong>{album.name}</strong>
          <small>{subtitle}</small>
        </span>
        <span className="search-card-play" aria-hidden="true">▶</span>
      </button>

      <button
        type="button"
        className={`search-album-favorite${favoriteAdded ? " search-album-favorite-added" : ""}`}
        disabled={busy || favoriteBusy || favoriteAdded}
        onClick={() => void addFavorite()}
      >
        <span aria-hidden="true">{favoriteAdded ? "♥" : "♡"}</span>
        {favoriteAdded ? "Favorit" : favoriteBusy ? "Lägger till…" : "Lägg till i favoriter"}
      </button>

      {favoriteError && <small className="search-album-favorite-error">Kunde inte lägga till i favoriter.</small>}
    </article>
  );
}

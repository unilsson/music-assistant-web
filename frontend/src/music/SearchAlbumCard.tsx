import { useEffect, useState } from "react";
import type { MusicAlbum } from "../api";
import FavoriteButton from "./FavoriteButton";
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
  busy,
  onOpen,
  onFavoriteError,
}: {
  album: MusicAlbum;
  busy: boolean;
  onOpen: () => void;
  onFavoriteError: (message: string) => void;
}) {
  const subtitle = [album.artist, album.year].filter(Boolean).join(" · ") || "Album";

  return (
    <article className="search-album-card">
      <button
        type="button"
        className="search-album-play"
        disabled={busy}
        onClick={onOpen}
        aria-label={`Öppna albumet ${album.name}`}
      >
        <AlbumArtwork album={album} />
        <span className="search-media-card-text">
          <strong>{album.name}</strong>
          <small>{subtitle}</small>
        </span>
        <span className="search-card-play search-card-open" aria-hidden="true">›</span>
      </button>

      <FavoriteButton
        kind="album"
        uri={album.uri}
        favorite={album.favorite}
        disabled={busy}
        onError={onFavoriteError}
      />
    </article>
  );
}

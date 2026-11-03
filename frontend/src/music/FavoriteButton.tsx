import { useEffect, useState } from "react";
import { setMusicFavorite, type FavoriteKind } from "../api";
import "./favorite-action.css";

export default function FavoriteButton({
  kind,
  uri,
  favorite,
  compact = false,
  disabled = false,
  onChanged,
  onError,
}: {
  kind: FavoriteKind;
  uri: string;
  favorite: boolean | null | undefined;
  compact?: boolean;
  disabled?: boolean;
  onChanged?: (favorite: boolean) => void | Promise<void>;
  onError?: (message: string) => void;
}) {
  const [active, setActive] = useState(favorite === true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActive(favorite === true);
  }, [favorite, uri]);

  const toggle = async () => {
    if (busy || disabled || !uri) {
      return;
    }

    const next = !active;
    setBusy(true);
    try {
      await setMusicFavorite(kind, uri, next);
      setActive(next);
      await onChanged?.(next);
    } catch (err) {
      onError?.(
        err instanceof Error
          ? err.message
          : next
            ? "Kunde inte lägga till favoriten"
            : "Kunde inte ta bort favoriten"
      );
    } finally {
      setBusy(false);
    }
  };

  const label = active ? "Ta bort från favoriter" : "Lägg till i favoriter";

  return (
    <button
      type="button"
      className={[
        "favorite-action",
        compact ? "favorite-action-compact" : "",
        active ? "favorite-action-active" : "",
      ].filter(Boolean).join(" ")}
      disabled={disabled || busy || !uri}
      onClick={() => void toggle()}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{active ? "♥" : "♡"}</span>
      {!compact && <span>{busy ? "Sparar…" : active ? "Favorit" : "Lägg till i favoriter"}</span>}
    </button>
  );
}

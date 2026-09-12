import { useEffect, useMemo, useState } from "react";
import type { RadioStation } from "./api";
import "./radio-library.css";

const RADIO_GENRE_STORAGE_KEY = "music-assistant-web.radio-genre";
const ALL_FILTER = "all";
const OTHER_FILTER = "other";
const GENRE_PREFIX = "genre:";

type RadioLibraryProps = {
  stations: RadioStation[];
  playerName: string;
  currentUri: string | null;
  currentName: string | null;
  loading: boolean;
  error: string | null;
  busyUri: string | null;
  onPlay: (station: RadioStation) => void;
};

function StationArtwork({ station }: { station: RadioStation }) {
  if (station.image) {
    return <img src={station.image} alt="" loading="lazy" />;
  }

  return (
    <div className="station-artwork-placeholder" aria-hidden="true">
      <span>♪</span>
    </div>
  );
}

export default function RadioLibrary({
  stations,
  playerName,
  currentUri,
  currentName,
  loading,
  error,
  busyUri,
  onPlay,
}: RadioLibraryProps) {
  const [selectedFilter, setSelectedFilter] = useState(() =>
    window.localStorage.getItem(RADIO_GENRE_STORAGE_KEY) ?? ALL_FILTER
  );

  const genres = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; count: number }>();

    for (const station of stations) {
      for (const genre of station.genres ?? []) {
        const existing = byId.get(genre.id);
        if (existing) {
          existing.count += 1;
        } else {
          byId.set(genre.id, {
            id: genre.id,
            name: genre.name,
            count: 1,
          });
        }
      }
    }

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [stations]);

  const otherCount = useMemo(
    () => stations.filter((station) => (station.genres ?? []).length === 0).length,
    [stations]
  );

  useEffect(() => {
    if (selectedFilter === ALL_FILTER) {
      return;
    }

    if (selectedFilter === OTHER_FILTER) {
      if (otherCount === 0) {
        setSelectedFilter(ALL_FILTER);
        window.localStorage.setItem(RADIO_GENRE_STORAGE_KEY, ALL_FILTER);
      }
      return;
    }

    const genreId = selectedFilter.startsWith(GENRE_PREFIX)
      ? selectedFilter.slice(GENRE_PREFIX.length)
      : "";
    if (!genres.some((genre) => genre.id === genreId)) {
      setSelectedFilter(ALL_FILTER);
      window.localStorage.setItem(RADIO_GENRE_STORAGE_KEY, ALL_FILTER);
    }
  }, [genres, otherCount, selectedFilter]);

  const filteredStations = useMemo(() => {
    if (selectedFilter === ALL_FILTER) {
      return stations;
    }

    if (selectedFilter === OTHER_FILTER) {
      return stations.filter((station) => (station.genres ?? []).length === 0);
    }

    const genreId = selectedFilter.startsWith(GENRE_PREFIX)
      ? selectedFilter.slice(GENRE_PREFIX.length)
      : "";

    return stations.filter((station) =>
      (station.genres ?? []).some((genre) => genre.id === genreId)
    );
  }, [selectedFilter, stations]);

  const chooseFilter = (filter: string) => {
    setSelectedFilter(filter);
    window.localStorage.setItem(RADIO_GENRE_STORAGE_KEY, filter);
  };

  return (
    <section className="radio-library" aria-labelledby="radio-library-title">
      <div className="radio-library-heading">
        <div>
          <p className="radio-library-kicker">Radio</p>
          <h2 id="radio-library-title">Radiostationer</h2>
          <p className="radio-library-subtitle">
            Tryck på en station för att spela på {playerName}.
          </p>
        </div>
        {!loading && !error && stations.length > 0 && (
          <span className="station-count">{filteredStations.length} stationer</span>
        )}
      </div>

      {error && <div className="radio-library-message error">{error}</div>}
      {loading && <div className="radio-library-message">Läser radiostationer…</div>}

      {!loading && !error && stations.length === 0 && (
        <div className="radio-library-message">
          Inga radiostationer finns i Music Assistant-biblioteket ännu.
        </div>
      )}

      {!loading && !error && stations.length > 0 && (
        <>
          <div className="radio-genre-filter" aria-label="Filtrera radiostationer efter genre">
            <button
              type="button"
              className={selectedFilter === ALL_FILTER ? "active" : ""}
              aria-pressed={selectedFilter === ALL_FILTER}
              onClick={() => chooseFilter(ALL_FILTER)}
            >
              Alla
            </button>

            {genres.map((genre) => {
              const filter = `${GENRE_PREFIX}${genre.id}`;
              return (
                <button
                  key={genre.id}
                  type="button"
                  className={selectedFilter === filter ? "active" : ""}
                  aria-pressed={selectedFilter === filter}
                  onClick={() => chooseFilter(filter)}
                >
                  {genre.name}
                </button>
              );
            })}

            {otherCount > 0 && (
              <button
                type="button"
                className={selectedFilter === OTHER_FILTER ? "active" : ""}
                aria-pressed={selectedFilter === OTHER_FILTER}
                onClick={() => chooseFilter(OTHER_FILTER)}
              >
                Övriga
              </button>
            )}
          </div>

          {filteredStations.length === 0 ? (
            <div className="radio-library-message">Inga stationer i den här kategorin.</div>
          ) : (
            <div className="station-grid">
              {filteredStations.map((station) => {
                const isCurrent =
                  currentUri === station.uri ||
                  (!currentUri && currentName === station.name);
                const isStarting = busyUri === station.uri;

                return (
                  <button
                    key={station.uri}
                    type="button"
                    className={`station-card ${isCurrent ? "is-current" : ""}`}
                    onClick={() => onPlay(station)}
                    disabled={busyUri !== null}
                    aria-label={`Spela ${station.name} på ${playerName}`}
                    aria-pressed={isCurrent}
                  >
                    <div className="station-artwork">
                      <StationArtwork station={station} />
                      <span className="station-play-icon" aria-hidden="true">
                        {isCurrent ? "●" : "▶"}
                      </span>
                      {isCurrent && <span className="station-live-pill">Spelar nu</span>}
                    </div>

                    <div className="station-card-text">
                      <strong>{station.name}</strong>
                      <span>
                        {isStarting ? "Startar…" : isCurrent ? playerName : "Tryck för att spela"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

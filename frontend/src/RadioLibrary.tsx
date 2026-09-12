import type { RadioStation } from "./api";
import "./radio-library.css";

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
          <span className="station-count">{stations.length} stationer</span>
        )}
      </div>

      {error && <div className="radio-library-message error">{error}</div>}
      {loading && <div className="radio-library-message">Läser radiostationer…</div>}

      {!loading && !error && stations.length === 0 && (
        <div className="radio-library-message">
          Inga radiostationer finns i Music Assistant-biblioteket ännu.
        </div>
      )}

      {!loading && stations.length > 0 && (
        <div className="station-grid">
          {stations.map((station) => {
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
    </section>
  );
}

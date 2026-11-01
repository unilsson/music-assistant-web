import { useEffect, useState } from "react";
import {
  nextTrack,
  playPause,
  playRadio,
  previousTrack,
  setVolume,
  skipPodcast,
  seekPodcast,
  type NowPlaying,
  type Player,
  type QueueContext,
  type QueuePreviewItem,
} from "../api";

function formatTime(value: number | null | undefined) {
  if (!Number.isFinite(value) || value == null || value < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function PreviewContent({ item, label }: { item: QueuePreviewItem | null; label: string }) {
  return (
    <>
      <p className="info-label">{label}</p>
      <div className="preview-artwork-wrap">
        {item?.image ? (
          <img className="preview-artwork" src={item.image} alt="" />
        ) : (
          <div className="preview-artwork preview-placeholder">♫</div>
        )}
      </div>
      <div className="preview-text">
        <strong>{item?.title ?? "Ingen låt"}</strong>
        <span>{item?.artist ?? ""}</span>
      </div>
    </>
  );
}

function TrackPreview({
  item,
  label,
  onActivate,
  disabled = false,
}: {
  item: QueuePreviewItem | null;
  label: string;
  onActivate?: () => void;
  disabled?: boolean;
}) {
  if (!item || !onActivate) {
    return (
      <aside className="queue-preview queue-preview-empty">
        <PreviewContent item={item} label={label} />
      </aside>
    );
  }

  return (
    <button
      type="button"
      className="queue-preview queue-preview-button"
      onClick={onActivate}
      disabled={disabled}
      aria-label={`${label}: ${item.title ?? "låt"}`}
      title={`Spela ${label.toLowerCase()} låt`}
    >
      <PreviewContent item={item} label={label} />
    </button>
  );
}

function RadioPanel({
  item,
  isActive,
  busy,
  onTransport,
}: {
  item: NowPlaying | QueuePreviewItem;
  isActive: boolean;
  busy: boolean;
  onTransport: () => void;
}) {
  const hasLiveMetadata = Boolean(item.liveArtist || item.liveTitle || item.streamTitle);

  return (
    <div className="radio-stage">
      <section
        className="radio-panel"
        aria-label={isActive ? "Direktsänd radio" : "Senast spelade radiostation"}
      >
        {isActive && (
          <div className="live-badge">
            <span className="live-dot" />
            LIVE
          </div>
        )}

        <div className="artwork-wrap radio-artwork-wrap">
          {item.image ? (
            <img className="artwork" src={item.image} alt="" />
          ) : (
            <div className="artwork artwork-placeholder">♫</div>
          )}
          <span className={`status-dot ${isActive ? "playing" : ""}`} />
        </div>

        <h2 className="radio-station-name">{item.stationName ?? item.title ?? "Radio"}</h2>

        {isActive && (
          <div className="radio-now-playing">
            <p className="info-label">Nu sänds</p>
            {hasLiveMetadata ? (
              <div className="radio-live-metadata">
                {item.liveArtist && <strong>{item.liveArtist}</strong>}
                {item.liveTitle && <span>{item.liveTitle}</span>}
                {!item.liveArtist && !item.liveTitle && item.streamTitle && (
                  <span>{item.streamTitle}</span>
                )}
              </div>
            ) : (
              <span className="radio-live-fallback">Direktsändning</span>
            )}
          </div>
        )}

        <div className="transport radio-transport" aria-label="Styr radio">
          <button
            className="primary-control"
            disabled={busy || (!isActive && !item.uri)}
            onClick={onTransport}
            aria-label={isActive ? "Stoppa radio" : "Spela radio"}
          >
            {isActive ? "■" : "▶"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function PlayerCard({
  player,
  queueContext,
  onChanged,
  preserveRadio = false,
}: {
  player: Player;
  queueContext: QueueContext | null;
  onChanged: () => Promise<void>;
  preserveRadio?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [volume, setLocalVolume] = useState(player.volumeLevel ?? 25);
  const [progress, setProgress] = useState(player.elapsedTime ?? 0);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await onChanged();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Kunde inte styra uppspelningen");
    } finally {
      setSeekDraft(null);
      setBusy(false);
    }
  };

  const radioStateActive = player.state === "playing" || player.state === "paused";
  const radioCandidate = player.nowPlaying?.mediaType === "radio"
    ? player.nowPlaying
    : queueContext?.current?.mediaType === "radio"
      ? queueContext.current
      : null;
  const radioItem = radioStateActive || preserveRadio ? radioCandidate : null;
  const isRadio = radioItem !== null;
  const isRadioActive = isRadio && radioStateActive;
  const now = isRadio
    ? radioItem
    : queueContext?.current?.mediaType === "radio"
      ? null
      : player.nowPlaying?.mediaType === "radio"
        ? queueContext?.current ?? null
        : queueContext?.current ?? player.nowPlaying;
  const isPlaying = player.state === "playing";
  const isPodcast = now?.mediaType === "podcast_episode";
  const duration = Number.isFinite(player.duration) && (player.duration ?? 0) > 0
    ? player.duration ?? 0
    : 0;

  useEffect(() => {
    if (player.volumeLevel != null) {
      setLocalVolume(player.volumeLevel);
    }
  }, [player.volumeLevel, player.id]);

  useEffect(() => {
    setProgress(Math.max(0, player.elapsedTime ?? 0));
  }, [player.elapsedTime, player.id, now?.title]);

  useEffect(() => {
    setSeekDraft(null);
  }, [player.id, now?.uri]);

  useEffect(() => {
    if (!isPlaying || isRadio) {
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => {
        const next = current + 1;
        return duration > 0 ? Math.min(next, duration) : next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPlaying, isRadio, duration]);

  const progressPercent = duration > 0
    ? Math.min(100, Math.max(0, (progress / duration) * 100))
    : 0;

  return (
    <article className="player-card player-card-single">
      {isRadio && radioItem ? (
        <RadioPanel
          item={radioItem}
          isActive={isRadioActive}
          busy={busy}
          onTransport={() => {
            if (isRadioActive) {
              void run(() => playPause(player.id));
              return;
            }

            const uri = radioItem.uri;
            if (uri) {
              void run(() => playRadio(player.id, uri));
            }
          }}
        />
      ) : isPodcast && now ? (
        <div className="podcast-playback-stage">
          <section className="podcast-playback-panel" aria-label="Podcastspelare">
            <div className="artwork-wrap">
              {now.image ? (
                <img className="artwork" src={now.image} alt="" />
              ) : (
                <div className="artwork artwork-placeholder">🎙</div>
              )}
              <span className={`status-dot ${isPlaying ? "playing" : ""}`} />
            </div>
            <div className="track-info">
              <p className="info-label">Podcast · Nu spelas</p>
              <div className="now-playing">
                <strong>{now.title ?? "Podcastavsnitt"}</strong>
                {now.artist && <span>{now.artist}</span>}
              </div>
              <div className="playback-progress">
                <div className="playback-times">
                  <span>{formatTime(seekDraft ?? progress)}</span>
                  <span>{duration > 0 ? formatTime(duration) : "–:––"}</span>
                </div>
                {duration > 0 ? (
                  <input
                    type="range"
                    className="podcast-seek-slider"
                    min={0}
                    max={Math.floor(duration)}
                    step={1}
                    value={Math.min(Math.floor(duration), Math.max(0, seekDraft ?? progress))}
                    disabled={busy}
                    aria-label="Spola i podcastavsnittet"
                    onChange={(event) => setSeekDraft(Number(event.target.value))}
                    onPointerUp={(event) => {
                      const value = Number(event.currentTarget.value);
                      void run(() => seekPodcast(player.id, value));
                    }}
                    onKeyUp={(event) => {
                      if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
                        const value = Number(event.currentTarget.value);
                        void run(() => seekPodcast(player.id, value));
                      }
                    }}
                  />
                ) : (
                  <div className="progress-track" aria-label="Uppspelningsposition saknas">
                    <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                )}
              </div>
              <div className="transport podcast-transport" aria-label="Styr podcast">
                <button type="button" disabled={busy} aria-label="Hoppa bakåt 15 sekunder" onClick={() => void run(() => skipPodcast(player.id, -15))}>↶ <small>15</small></button>
                <button type="button" className="primary-control" disabled={busy} aria-label={isPlaying ? "Pausa podcast" : "Fortsätt podcast"} onClick={() => void run(() => playPause(player.id))}>{isPlaying ? "❚❚" : "▶"}</button>
                <button type="button" disabled={busy} aria-label="Hoppa framåt 30 sekunder" onClick={() => void run(() => skipPodcast(player.id, 30))}>↷ <small>30</small></button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="queue-stage">
          <TrackPreview
            item={queueContext?.previous ?? null}
            label="Föregående"
            disabled={busy}
            onActivate={() => void run(() => previousTrack(player.id))}
          />

          <section className="media-panel" aria-label="Nu spelas">
            <div className="artwork-wrap">
              {now?.image ? (
                <img className="artwork" src={now.image} alt="" />
              ) : (
                <div className="artwork artwork-placeholder">♫</div>
              )}
              <span className={`status-dot ${isPlaying ? "playing" : ""}`} />
            </div>

            <div className="track-info">
              <p className="info-label">Nu spelas</p>
              <div className="now-playing">
                <strong>{now?.title ?? "Inget spelar"}</strong>
                <span>{now?.artist ?? "Välj musik nedan"}</span>
                {now?.album && <small>{now.album}</small>}
              </div>

              <div className="playback-progress">
                <div className="playback-times">
                  <span>{formatTime(progress)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Uppspelning"
                  aria-valuemin={0}
                  aria-valuemax={duration || 0}
                  aria-valuenow={Math.min(progress, duration || progress)}
                >
                  <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>

              <div className="transport" aria-label={`Styr ${player.name}`}>
                <button
                  disabled={busy}
                  onClick={() => void run(() => previousTrack(player.id))}
                  aria-label="Föregående"
                >
                  ◀◀
                </button>
                <button
                  className="primary-control"
                  disabled={busy}
                  onClick={() => void run(() => playPause(player.id))}
                  aria-label="Spela eller pausa"
                >
                  {isPlaying ? "❚❚" : "▶"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => void run(() => nextTrack(player.id))}
                  aria-label="Nästa"
                >
                  ▶▶
                </button>
              </div>
            </div>
          </section>

          <TrackPreview
            item={queueContext?.next ?? null}
            label="Nästa"
            disabled={busy}
            onActivate={() => void run(() => nextTrack(player.id))}
          />
        </div>
      )}

      {actionError && <p className="podcast-control-error" role="alert">{actionError}</p>}
      <div className="player-controls-row">
        <section className="player-info" aria-label="Spelarinfo">
          <strong className="player-name">{player.name}</strong>
          <span className={`player-state ${isPlaying ? "playing" : ""}`}>
            {isPlaying ? "Spelar" : player.state === "paused" ? "Pausad" : "Redo"}
          </span>
        </section>

        <label className="volume-control">
          <span>Volym</span>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => setLocalVolume(Number(event.target.value))}
            onPointerUp={() => void run(() => setVolume(player.id, volume))}
            onKeyUp={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                void run(() => setVolume(player.id, volume));
              }
            }}
          />
          <output>{volume}%</output>
        </label>
      </div>
    </article>
  );
}

import { useState } from "react";
import type { LocalAudioController } from "./useLocalAudio";
import "./local-player.css";

function clock(seconds: number): string {
  const value = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = String(value % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` :
    `${minutes}:${secs}`;
}

export default function LocalAudioPlayer({ controller }: {
  controller: LocalAudioController;
}) {
  const { item, status, position, duration, error, toggle, seek, skip, stop } = controller;
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  if (!item) return null;
  const podcast = item.kind === "podcast";
  const canSeek = podcast && duration > 0;
  return (
    <section className="local-player" aria-label="Spelar på den här enheten">
      <div className="local-player-label">📱 SPELAR PÅ DEN HÄR ENHETEN</div>
      <div className="local-player-main">
        <div className="local-player-cover">
          {item.image ? <img src={item.image} alt="" /> : <span aria-hidden="true">{podcast ? "🎙" : "●"}</span>}
        </div>
        <div className="local-player-info">
          <strong>{item.title}</strong>
          <span>{item.subtitle ?? (podcast ? "Podcast" : "Radio")}</span>
          <small>{status === "loading" ? "Ansluter…" : status === "playing" ? "Spelar" :
            status === "paused" ? "Pausad" : status === "error" ? "Uppspelningsfel" : "Redo"}</small>
        </div>
        <button type="button" className="local-stop" title="Avsluta uppspelningen" aria-label="Avsluta uppspelningen" onClick={stop}>✕</button>
      </div>
      {podcast && (
        <div className="local-progress">
          <div className="local-time"><span>{clock(seekDraft ?? position)}</span><span>{duration > 0 ? clock(duration) : "–:––"}</span></div>
          <input type="range" aria-label="Spola i podcastavsnittet" min="0"
            max={Math.max(1, Math.floor(duration))} step="1"
            value={Math.min(Math.floor(duration || 1), Math.max(0, Math.floor(seekDraft ?? position)))}
            disabled={!canSeek}
            onChange={(event) => setSeekDraft(Number(event.target.value))}
            onPointerUp={(event) => {
              if (canSeek) seek(Number(event.currentTarget.value));
              setSeekDraft(null);
            }}
            onKeyUp={(event) => {
              if (canSeek && ["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
                seek(Number(event.currentTarget.value));
                setSeekDraft(null);
              }
            }}
          />
        </div>
      )}
      <div className="local-transport" aria-label="Styr uppspelning på den här enheten">
        {podcast && (
          <button type="button" title="15 sekunder bakåt" aria-label="15 sekunder bakåt" onClick={() => skip(-15)}>↶ <small>15</small></button>
        )}
        <button type="button" className="local-primary" aria-label={status === "playing" ? "Pausa" : "Spela"} onClick={toggle}>
          {status === "playing" ? "❚❚" : "▶"}
        </button>
        {podcast && (
          <button type="button" title="30 sekunder framåt" aria-label="30 sekunder framåt" onClick={() => skip(30)}>↷ <small>30</small></button>
        )}
      </div>
      {error && <p className="local-player-error" role="alert">{error}</p>}
    </section>
  );
}

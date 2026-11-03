import { useCallback, useEffect, useRef, useState } from "react";
import { localAudioUrl, verifyLocalAudio, type LocalAudioRequest } from "../api";

export const BROWSER_PLAYER_ID = "__this_device__";
const HISTORY_KEY = "music-assistant-web.local-podcast-progress.v1";

export type LocalPlaybackItem = LocalAudioRequest & {
  title: string;
  subtitle?: string | null;
  image?: string | null;
  duration?: number | null;
};

export type LocalEpisodeRecord = LocalPlaybackItem & {
  kind: "podcast";
  position: number;
  completed: boolean;
  updatedAt: number;
};

export type LocalStatus = "idle" | "loading" | "playing" | "paused" | "error";

function readHistory(): LocalEpisodeRecord[] {
  try {
    const data = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is LocalEpisodeRecord =>
      item?.kind === "podcast" && typeof item.uri === "string" &&
      typeof item.podcastId === "string" && typeof item.title === "string" &&
      Number.isSafeInteger(item.offset) && item.offset >= 0 &&
      Number.isFinite(item.position) && item.position >= 0 &&
      Number.isFinite(item.updatedAt)
    ).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100);
  } catch {
    return [];
  }
}

function updateHistory(
  item: LocalPlaybackItem,
  position: number,
  completed: boolean,
  onUpdate: (items: LocalEpisodeRecord[]) => void
) {
  if (item.kind !== "podcast") return;
  const previous = readHistory().filter((entry) => entry.uri !== item.uri);
  const entry: LocalEpisodeRecord = {
    ...item,
    position: Math.max(0, position),
    completed,
    updatedAt: Date.now(),
  };
  const next = [entry, ...previous].slice(0, 100);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    onUpdate(next);
  } catch {
    // Safari private browsing / storage limitations must not block playback.
  }
}

export function useLocalAudio() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentRef = useRef<LocalPlaybackItem | null>(null);
  const saveAtRef = useRef(0);
  const [item, setItem] = useState<LocalPlaybackItem | null>(null);
  const [status, setStatus] = useState<LocalStatus>("idle");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<LocalEpisodeRecord[]>(readHistory);

  const start = useCallback((next: LocalPlaybackItem) => {
    const audio = audioRef.current;
    if (!audio) return;
    // Must be called directly from the click/touch handler. Safari can reject
    // playback if a network request is awaited before calling audio.play().
    audio.pause();
    currentRef.current = next;
    setItem(next);
    setError(null);
    setStatus("loading");
    setPosition(0);
    setDuration(next.duration && Number.isFinite(next.duration) ? next.duration : 0);
    saveAtRef.current = 0;
    audio.src = localAudioUrl(next);
    audio.load();
    void audio.play().catch((reason) => {
      if (currentRef.current?.uri !== next.uri) return;
      setError(reason?.name === "NotAllowedError"
        ? "Tryck på Spela igen – webbläsaren kräver en användaråtgärd."
        : "Ljudet kunde inte startas på den här enheten.");
      setStatus("paused");
    });
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    currentRef.current = null;
    setItem(null);
    setStatus("idle");
    setPosition(0);
    setDuration(0);
    setError(null);
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentRef.current) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    setError(null);
    void audio.play().catch(() => {
      setStatus("paused");
      setError("Kunde inte fortsätta uppspelningen.");
    });
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !currentRef.current || currentRef.current.kind !== "podcast") return;
    const limit = Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration : (currentRef.current.duration ?? 0);
    const target = Math.max(0, limit > 0 ? Math.min(seconds, limit) : seconds);
    try {
      audio.currentTime = target;
      setPosition(target);
    } catch {
      setError("Det går inte att spola i den här ljudströmmen.");
    }
  }, []);

  const skip = useCallback((seconds: number) => {
    seek((audioRef.current?.currentTime ?? 0) + seconds);
  }, [seek]);

  useEffect(() => {
    const audio = audioRef.current;
    const session = navigator.mediaSession;
    if (!audio || !session || !item) return;
    session.metadata = new MediaMetadata({
      title: item.title,
      artist: item.subtitle || (item.kind === "radio" ? "Radio" : "Podcast"),
      album: item.kind === "radio" ? "Radio" : "Podcasts",
      artwork: item.image ? [{ src: item.image }] : [],
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ["play", () => { void audio.play(); }],
      ["pause", () => audio.pause()],
      ["stop", () => audio.pause()],
      ["seekbackward", (details) => skip(-(details.seekOffset ?? 15))],
      ["seekforward", (details) => skip(details.seekOffset ?? 30)],
      ["seekto", (details) => {
        if (details.seekTime != null) seek(details.seekTime);
      }],
    ];
    for (const [name, handler] of handlers) {
      try { session.setActionHandler(name, handler); } catch { /* not supported */ }
    }
    return () => {
      for (const [name] of handlers) {
        try { session.setActionHandler(name, null); } catch { /* not supported */ }
      }
    };
  }, [item, seek, skip]);

  useEffect(() => {
    if (!navigator.mediaSession) return;
    navigator.mediaSession.playbackState = status === "playing" ? "playing" :
      status === "paused" ? "paused" : "none";
    if (item?.kind === "podcast" && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(duration, Math.max(0, position)),
        });
      } catch { /* not supported */ }
    }
  }, [status, duration, position, item]);

  const savePosition = useCallback((completed = false) => {
    const audio = audioRef.current;
    const current = currentRef.current;
    if (!audio || !current || current.kind !== "podcast") return;
    updateHistory(current, audio.currentTime || 0, completed, setHistory);
    saveAtRef.current = Date.now();
  }, []);

  const audioElement = (
    <audio
      ref={audioRef}
      preload="none"
      onLoadedMetadata={(event) => {
        const audio = event.currentTarget;
        const current = currentRef.current;
        const actualDuration = Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration : (current?.duration ?? 0);
        setDuration(actualDuration);
        if (current?.kind === "podcast") {
          const previous = readHistory().find((record) => record.uri === current.uri);
          if (previous && !previous.completed && previous.position >= 5 &&
            (actualDuration <= 0 || previous.position < actualDuration - 10)) {
            try { audio.currentTime = previous.position; } catch { /* may not support range */ }
          }
        }
      }}
      onDurationChange={(event) => {
        const value = event.currentTarget.duration;
        if (Number.isFinite(value) && value > 0) setDuration(value);
      }}
      onTimeUpdate={(event) => {
        setPosition(event.currentTarget.currentTime);
        if (Date.now() - saveAtRef.current > 5000) savePosition();
      }}
      onPlay={() => setStatus("playing")}
      onPlaying={() => setStatus("playing")}
      onPause={() => {
        if (currentRef.current) {
          setStatus("paused");
          savePosition();
        }
      }}
      onWaiting={() => setStatus("loading")}
      onEnded={() => {
        savePosition(true);
        setStatus("paused");
      }}
      onError={() => {
        const current = currentRef.current;
        if (!current) return;
        setStatus("error");
        setError("Ljudet kunde inte spelas. Kontrollera om källan har en kompatibel ljudström.");
        void verifyLocalAudio(current).catch((reason) => {
          if (currentRef.current?.uri !== current.uri) return;
          setError(reason instanceof Error ? reason.message :
            "Kunde inte hämta ljudströmmen.");
        });
      }}
      style={{ display: "none" }}
    />
  );

  return { audioElement, item, status, position, duration, error,
    history, start, stop, toggle, seek, skip };
}

export type LocalAudioController = ReturnType<typeof useLocalAudio>;

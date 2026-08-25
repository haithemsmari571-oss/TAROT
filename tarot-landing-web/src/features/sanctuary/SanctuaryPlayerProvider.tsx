import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { SanctuaryBrowseItem } from "./api/libraryItemsApi";
import { startOrb } from "./orb/startOrb";
import styles from "./SanctuaryPage.module.css";

type PlayableItem = SanctuaryBrowseItem & { audioUrl: string };

type SanctuaryPlayerContextValue = {
  activeItem: SanctuaryBrowseItem | null;
  isPlaying: boolean;
  playItem: (item: SanctuaryBrowseItem) => void;
  setTrackList: (items: SanctuaryBrowseItem[]) => void;
};

const SanctuaryPlayerContext = createContext<SanctuaryPlayerContextValue | null>(null);
const HISTORY_KEY = "sanctuaryNowPlaying";
const PLAYER_ATTRIBUTE = "data-sanctuary-player";
let appAudioElement: HTMLAudioElement | null = null;

function getAppAudioElement() {
  if (appAudioElement) {
    if (!appAudioElement.isConnected) document.body.append(appAudioElement);
    return appAudioElement;
  }

  const existing = document.querySelector<HTMLAudioElement>(`audio[${PLAYER_ATTRIBUTE}="true"]`);
  const audio = existing ?? document.createElement("audio");
  audio.setAttribute(PLAYER_ATTRIBUTE, "true");
  audio.setAttribute("aria-hidden", "true");
  audio.setAttribute("playsinline", "");
  audio.preload = "metadata";
  audio.playsInline = true;
  audio.hidden = true;
  if (!audio.isConnected) document.body.append(audio);
  appAudioElement = audio;
  return audio;
}

function sameItem(left: SanctuaryBrowseItem | null, right: SanctuaryBrowseItem) {
  return left?.source === right.source && left.key === right.key;
}

function formatPlayerTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remaining = String(wholeSeconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remaining}` : `${minutes}:${remaining}`;
}

function SkipIcon({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {direction === "previous" ? (
        <path d="M6 5v14M19 6.5 9 12l10 5.5z" />
      ) : (
        <path d="M18 5v14M5 6.5 15 12 5 17.5z" />
      )}
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.5 5-7 7 7 7" />
    </svg>
  );
}

function PlayerCover({ item }: { item: SanctuaryBrowseItem }) {
  if (item.coverUrl) {
    return <img className={styles.coverImage} src={item.coverUrl} alt={`Cover art for ${item.title}`} />;
  }

  const initials = item.title
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return <span className={styles.playerFallbackCover} aria-hidden="true">{initials || "✦"}</span>;
}

export function SanctuaryPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transportQueueRef = useRef<Promise<void>>(Promise.resolve());
  const audibleRef = useRef(false);
  const orbContainerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<SanctuaryBrowseItem | null>(null);
  const trackListRef = useRef<PlayableItem[]>([]);
  const openRef = useRef(false);
  const historyMarkerRef = useRef<string | null>(null);
  const closePendingRef = useRef(false);
  const [activeItem, setActiveItem] = useState<SanctuaryBrowseItem | null>(null);
  const [trackCount, setTrackCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);

  const ensureAudio = useCallback(() => {
    const audio = getAppAudioElement();
    audioRef.current = audio;
    return audio;
  }, []);

  useEffect(() => {
    const audio = ensureAudio();
    const setAudible = (audible: boolean) => {
      audibleRef.current = audible;
      setIsPlaying(audible);
    };
    const syncDuration = () => {
      if (Number.isFinite(audio.duration)) setTotalSeconds(audio.duration);
    };
    const syncElapsed = () => setElapsedSeconds(audio.currentTime);
    const onPlay = () => {
      if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && !audio.muted && audio.volume > 0) setAudible(true);
    };
    const onPlaying = () => setAudible(!audio.muted && audio.volume > 0);
    const onNotAudible = () => setAudible(false);
    const onVolumeChange = () => {
      if (audio.muted || audio.volume <= 0) setAudible(false);
      else if (!audio.paused && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) setAudible(true);
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onNotAudible);
    audio.addEventListener("ended", onNotAudible);
    audio.addEventListener("waiting", onNotAudible);
    audio.addEventListener("emptied", onNotAudible);
    audio.addEventListener("error", onNotAudible);
    audio.addEventListener("volumechange", onVolumeChange);
    audio.addEventListener("timeupdate", syncElapsed);
    audio.addEventListener("seeked", syncElapsed);
    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("durationchange", syncDuration);
    setAudible(!audio.paused && !audio.ended && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && !audio.muted && audio.volume > 0);
    syncDuration();
    syncElapsed();

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onNotAudible);
      audio.removeEventListener("ended", onNotAudible);
      audio.removeEventListener("waiting", onNotAudible);
      audio.removeEventListener("emptied", onNotAudible);
      audio.removeEventListener("error", onNotAudible);
      audio.removeEventListener("volumechange", onVolumeChange);
      audio.removeEventListener("timeupdate", syncElapsed);
      audio.removeEventListener("seeked", syncElapsed);
      audio.removeEventListener("loadedmetadata", syncDuration);
      audio.removeEventListener("durationchange", syncDuration);
      audibleRef.current = false;
      audioRef.current = null;
    };
  }, [ensureAudio]);

  const enqueueTransport = useCallback((operation: (audio: HTMLAudioElement) => void | Promise<void>) => {
    const run = () => operation(ensureAudio());
    const next = transportQueueRef.current.then(run, run);
    transportQueueRef.current = next.catch(() => undefined);
    return transportQueueRef.current;
  }, [ensureAudio]);

  const playAudio = useCallback((audio: HTMLAudioElement) => {
    return audio.play().then(() => undefined).catch(() => undefined);
  }, []);

  const requestPlay = useCallback(() => {
    void enqueueTransport(playAudio);
  }, [enqueueTransport, playAudio]);

  const requestPause = useCallback(() => {
    void enqueueTransport((audio) => {
      audio.pause();
    });
  }, [enqueueTransport]);

  const openNowPlaying = useCallback(() => {
    if (openRef.current || closePendingRef.current || !activeItemRef.current) return;
    const marker = `${Date.now()}:${Math.random()}`;
    const currentState = window.history.state;
    const nextState = currentState && typeof currentState === "object"
      ? { ...currentState, [HISTORY_KEY]: marker }
      : { [HISTORY_KEY]: marker };
    window.history.pushState(nextState, "", window.location.href);
    historyMarkerRef.current = marker;
    openRef.current = true;
    setNowPlayingOpen(true);
  }, []);

  const closeNowPlaying = useCallback(() => {
    if (!openRef.current || closePendingRef.current) return;
    const marker = historyMarkerRef.current;
    if (marker && window.history.state?.[HISTORY_KEY] === marker) {
      closePendingRef.current = true;
      setNowPlayingOpen(false);
      window.history.back();
      return;
    }

    openRef.current = false;
    historyMarkerRef.current = null;
    setNowPlayingOpen(false);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (!openRef.current && !closePendingRef.current) return;
      openRef.current = false;
      closePendingRef.current = false;
      historyMarkerRef.current = null;
      setNowPlayingOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!nowPlayingOpen) return;
    const container = orbContainerRef.current;
    const audio = audioRef.current;
    if (!container || !audio) return;
    const orb = startOrb(container, audio, (viewportWidth, viewportHeight) => viewportWidth <= 760
      ? Math.min(viewportWidth * 0.78, viewportHeight * 0.55)
      : Math.min(viewportWidth * 0.6, viewportHeight * 0.62));
    return () => orb.stop();
  }, [nowPlayingOpen]);

  useEffect(() => {
    if (!nowPlayingOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeNowPlaying();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeNowPlaying, nowPlayingOpen]);

  useEffect(() => {
    if (!nowPlayingOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [nowPlayingOpen]);

  const setTrackList = useCallback((items: SanctuaryBrowseItem[]) => {
    const playableItems = items.filter((item): item is PlayableItem => Boolean(item.audioUrl));
    trackListRef.current = playableItems;
    setTrackCount(playableItems.length);
    const current = activeItemRef.current;
    if (!current) return;
    const refreshed = playableItems.find((item) => sameItem(current, item));
    if (refreshed) {
      activeItemRef.current = refreshed;
      setActiveItem(refreshed);
    }
  }, []);

  const playItem = useCallback((item: SanctuaryBrowseItem) => {
    if (!item.audioUrl) return;
    if (!sameItem(activeItemRef.current, item)) {
      activeItemRef.current = item;
      setActiveItem(item);
      setElapsedSeconds(0);
      setTotalSeconds(item.durationSeconds ?? 0);
    }
    openNowPlaying();
    void enqueueTransport(async (audio) => {
      if (!sameItem(activeItemRef.current, item)) return;
      const itemAudioUrl = new URL(item.audioUrl, document.baseURI).href;
      if (audio.src !== itemAudioUrl) {
        audio.dataset.orbTrackName = item.title;
        audio.src = itemAudioUrl;
      }
      await playAudio(audio);
    });
  }, [enqueueTransport, openNowPlaying, playAudio]);

  const togglePlayback = useCallback(() => {
    void enqueueTransport(async (audio) => {
      if (audio.paused || audio.ended || !audibleRef.current) await playAudio(audio);
      else audio.pause();
    });
  }, [enqueueTransport, playAudio]);

  const skipTrack = useCallback((direction: -1 | 1) => {
    void enqueueTransport(async (audio) => {
      const current = activeItemRef.current;
      const tracks = trackListRef.current;
      if (!current || tracks.length < 2) return;
      const activeIndex = tracks.findIndex((item) => sameItem(current, item));
      if (activeIndex < 0) return;

      const nextItem = tracks[(activeIndex + direction + tracks.length) % tracks.length];
      const keepPlaying = !audio.paused && !audio.ended;
      audio.dataset.orbTrackName = nextItem.title;
      audio.src = nextItem.audioUrl;
      activeItemRef.current = nextItem;
      setActiveItem(nextItem);
      setElapsedSeconds(0);
      setTotalSeconds(nextItem.durationSeconds ?? 0);
      if (keepPlaying) await playAudio(audio);
    });
  }, [enqueueTransport, playAudio]);

  const seek = useCallback((seconds: number) => {
    void enqueueTransport((audio) => {
      audio.currentTime = seconds;
    });
  }, [enqueueTransport]);

  useEffect(() => {
    if (!activeItem || !("mediaSession" in navigator)) return;
    const mediaSession = navigator.mediaSession;
    if (typeof MediaMetadata !== "undefined") {
      mediaSession.metadata = new MediaMetadata({
        title: activeItem.title,
        artist: "Ask Valentina",
        album: activeItem.type,
        artwork: activeItem.coverUrl ? [{ src: activeItem.coverUrl }] : [],
      });
    }

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", requestPlay],
      ["pause", requestPause],
      ["previoustrack", () => skipTrack(-1)],
      ["nexttrack", () => skipTrack(1)],
    ];
    for (const [action, handler] of handlers) {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // Browsers may expose Media Session while omitting individual actions.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          mediaSession.setActionHandler(action, null);
        } catch {
          // Match the guarded registration above.
        }
      }
    };
  }, [activeItem, requestPause, requestPlay, skipTrack]);

  useEffect(() => {
    if (!activeItem || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [activeItem, isPlaying]);

  const contextValue = useMemo<SanctuaryPlayerContextValue>(() => ({
    activeItem,
    isPlaying,
    playItem,
    setTrackList,
  }), [activeItem, isPlaying, playItem, setTrackList]);

  return (
    <SanctuaryPlayerContext.Provider value={contextValue}>
      {children}
      {activeItem ? (
        <>
          <aside
            className={`${styles.playerLayer} ${styles.playerBar}`}
            aria-label="Now playing"
            onClick={(event) => {
              if (!(event.target instanceof Element) || !event.target.closest("button, input")) openNowPlaying();
            }}
          >
            <div className={styles.playerInner}>
              <button className={styles.playerOpen} type="button" onClick={openNowPlaying} aria-label={`Open now playing for ${activeItem.title}`}>
                <span className={styles.playerCover}><PlayerCover item={activeItem} /></span>
                <span className={styles.playerCopy} aria-live="polite">
                  <span>{activeItem.type}</span>
                  <strong>{activeItem.title}</strong>
                </span>
              </button>
              <button className={styles.playerToggle} type="button" onClick={() => { togglePlayback(); openNowPlaying(); }} aria-label={`${isPlaying ? "Pause" : "Play"} ${activeItem.title}`}>
                <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
              </button>
              <div className={styles.playerTimeline}>
                <span>{formatPlayerTime(elapsedSeconds)}</span>
                <input
                  className={styles.playerSeek}
                  type="range"
                  min="0"
                  max={Math.max(totalSeconds, 0)}
                  step="0.1"
                  value={Math.min(elapsedSeconds, totalSeconds || 0)}
                  onChange={(event) => seek(Number(event.target.value))}
                  onClick={openNowPlaying}
                  aria-label={`Seek ${activeItem.title}`}
                />
                <span>{formatPlayerTime(totalSeconds)}</span>
              </div>
            </div>
          </aside>
        </>
      ) : null}
      {activeItem && nowPlayingOpen && typeof document !== "undefined" ? createPortal(
        <section className={`${styles.playerLayer} ${styles.nowPlayingOverlay}`} role="dialog" aria-modal="true" aria-labelledby="sanctuary-now-playing-title" data-sanctuary-now-playing="true">
          <div className={styles.nowPlayingOrb} ref={orbContainerRef} />
          <button className={styles.nowPlayingBack} type="button" onClick={closeNowPlaying} autoFocus aria-label="Back to the page">
            <BackIcon />
            <span>Back</span>
          </button>
          <button className={styles.nowPlayingClose} type="button" onClick={closeNowPlaying} aria-label="Close now playing">
            <span className={styles.nowPlayingCloseGlyph} aria-hidden="true">×</span>
            <span className={styles.nowPlayingCloseLabel}>Close</span>
          </button>
          <div className={styles.nowPlayingDock}>
            <div className={styles.nowPlayingCopy}>
              <span className={styles.nowPlayingType}>{activeItem.type}</span>
              <strong className={styles.nowPlayingTitle} id="sanctuary-now-playing-title">{activeItem.title}</strong>
            </div>
            <div className={styles.nowPlayingControls} aria-label="Now-playing controls">
              <div className={styles.nowPlayingTimes}>
                <span className={styles.nowPlayingElapsed}>{formatPlayerTime(elapsedSeconds)}</span>
                <span className={styles.nowPlayingTotal}>{formatPlayerTime(totalSeconds)}</span>
              </div>
              <input
                className={styles.nowPlayingSeek}
                type="range"
                min="0"
                max={Math.max(totalSeconds, 0)}
                step="0.1"
                value={Math.min(elapsedSeconds, totalSeconds || 0)}
                onChange={(event) => seek(Number(event.target.value))}
                aria-label={`Seek ${activeItem.title} in now playing`}
              />
              <div className={styles.nowPlayingTransport}>
                <button className={styles.nowPlayingSkip} type="button" onClick={() => skipTrack(-1)} disabled={trackCount < 2} aria-label="Previous track">
                  <SkipIcon direction="previous" />
                </button>
                <button className={styles.nowPlayingToggle} type="button" onClick={togglePlayback} aria-label={`${isPlaying ? "Pause" : "Play"} ${activeItem.title}`}>
                  <span className={styles.nowPlayingToggleGlyph} aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
                </button>
                <button className={styles.nowPlayingSkip} type="button" onClick={() => skipTrack(1)} disabled={trackCount < 2} aria-label="Next track">
                  <SkipIcon direction="next" />
                </button>
              </div>
            </div>
          </div>
        </section>,
        document.body,
      ) : null}
    </SanctuaryPlayerContext.Provider>
  );
}

export function useSanctuaryPlayer() {
  const value = useContext(SanctuaryPlayerContext);
  if (!value) throw new Error("useSanctuaryPlayer must be used inside SanctuaryPlayerProvider");
  return value;
}

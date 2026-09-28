/* The Shorts tab: Valentina's reels, one at a time, full height, swiped up for
   the next the way Instagram Reels works. The reels come from the library shelf
   (GET /library-items/reels), newest first. The reel at least 60 percent in
   view plays from its start; every other reel waits paused at 0. Sound is one
   switch for every reel, off until the client turns it on. */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReels, resolveLibraryMediaUrl, type ReelItem } from "@/features/sanctuary/api/libraryItemsApi";
import { useSanctuaryPlayer } from "@/features/sanctuary/SanctuaryPlayerProvider";
import { sanitizeClaims } from "@/lib/copy";
import "./client-chats.css";
import "./client-shorts.css";

/* How much of a slide must be in view before its reel is the one playing. */
const ACTIVE_RATIO = 0.6;

/* The sound switch outlives the screen for the rest of the session, so leaving
   the tab and coming back keeps the client's choice. */
let sessionMuted = true;

function SoundGlyph({ muted }: { muted: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5Z" />
      {muted ? <path d="m16 9.5 5 5m0-5-5 5" /> : <><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a7.5 7.5 0 0 1 0 11" /></>}
    </svg>
  );
}

interface ReelProps {
  reel: ReelItem;
  index: number;
  active: boolean;
  paused: boolean;
  muted: boolean;
  onToggleSound: () => void;
  onTogglePause: () => void;
  onSoundRefused: () => void;
  onPlaying: () => void;
}

function Reel({ reel, index, active, paused, muted, onToggleSound, onTogglePause, onSoundRefused, onPlaying }: ReelProps) {
  const video = useRef<HTMLVideoElement>(null);
  const progress = useRef<HTMLSpanElement>(null);

  // First, so a reel that starts below plays with the sound the switch shows.
  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted]);

  // A reel that becomes active starts from 0; one that leaves waits at 0.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!active) element.pause();
    element.currentTime = 0;
  }, [active]);

  useEffect(() => {
    const element = video.current;
    if (!element || !active) return;
    if (paused) {
      element.pause();
      return;
    }
    element.play().catch((error: unknown) => {
      // The browser refuses sound without a gesture: carry on without it.
      if ((error as DOMException | null)?.name !== "NotAllowedError" || element.muted) return;
      element.muted = true;
      onSoundRefused();
      element.play().catch(() => undefined);
    });
    // onSoundRefused is fresh on every render; only the reel's own state restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused]);

  // Leaving the tab silences every reel.
  useEffect(() => {
    const element = video.current;
    return () => element?.pause();
  }, []);

  const showProgress = () => {
    const element = video.current;
    if (!element || !progress.current) return;
    const share = element.duration > 0 ? element.currentTime / element.duration : 0;
    progress.current.style.width = `${Math.min(share, 1) * 100}%`;
  };

  const posterUrl = resolveLibraryMediaUrl(reel.cover_url);
  return (
    <div className="client-shorts-slide" data-index={index} data-reel-key={reel.key}>
      <div className="client-shorts-stage" onClick={() => { if (active) onTogglePause(); }}>
        <video
          ref={video}
          className="client-shorts-video"
          src={resolveLibraryMediaUrl(reel.video_url) ?? undefined}
          poster={posterUrl ?? undefined}
          width={reel.video_width ?? undefined}
          height={reel.video_height ?? undefined}
          playsInline
          loop
          muted
          preload="metadata"
          onTimeUpdate={showProgress}
          onPlaying={() => { if (active) onPlaying(); }}
        />
        {active && paused && <span className="client-shorts-play" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5L8 5.5Z" /></svg></span>}
        <div className="client-shorts-caption">
          <p className="client-shorts-title">{reel.title}</p>
          {reel.description && <p className="client-shorts-description">{sanitizeClaims(reel.description)}</p>}
        </div>
        <button
          type="button"
          className="client-shorts-sound"
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          aria-pressed={!muted}
          onClick={event => { event.stopPropagation(); onToggleSound(); }}
        >
          <SoundGlyph muted={muted} />
        </button>
        <span className="client-shorts-track" aria-hidden="true"><span ref={progress} className="client-shorts-progress" /></span>
      </div>
    </div>
  );
}

function Reels({ reels }: { reels: ReelItem[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // The reel the client paused by tapping it; moving to another reel clears it.
  const [pausedIndex, setPausedIndex] = useState<number | null>(null);
  const [muted, setMutedState] = useState(sessionMuted);
  const { isPlaying: sanctuaryPlaying, pause: pauseSanctuary } = useSanctuaryPlayer();

  const setMuted = (value: boolean) => {
    sessionMuted = value;
    setMutedState(value);
  };
  const togglePause = () => setPausedIndex(current => (current === active ? null : active));

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < ACTIVE_RATIO) continue;
        const index = Number((entry.target as HTMLElement).dataset.index);
        setActive(index);
        setPausedIndex(current => (current === index ? current : null));
      }
    }, { root, threshold: [ACTIVE_RATIO] });
    for (const slide of Array.from(root.children)) observer.observe(slide);
    return () => observer.disconnect();
  }, [reels.length]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const slides = scroller.current?.children;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      slides?.[active + (event.key === "ArrowDown" ? 1 : -1)]?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (event.key === " " && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      togglePause();
    } else if (event.key === "m" || event.key === "M") {
      setMuted(!muted);
    }
  };

  return (
    <div className="client-shorts" ref={scroller} tabIndex={0} onKeyDown={onKeyDown} aria-label="Reels">
      {reels.map((reel, index) => (
        <Reel
          key={reel.key}
          reel={reel}
          index={index}
          active={index === active}
          paused={pausedIndex === index}
          muted={muted}
          onToggleSound={() => setMuted(!muted)}
          onTogglePause={togglePause}
          onSoundRefused={() => setMuted(true)}
          onPlaying={() => { if (sanctuaryPlaying) pauseSanctuary(); }}
        />
      ))}
    </div>
  );
}

export default function ClientShortsScreen() {
  const reels = useQuery({
    queryKey: ["app-reels"],
    queryFn: getReels,
    staleTime: 60_000,
    // A refetch must never restart the reel in view.
    refetchOnWindowFocus: false,
  });

  return (
    <section className="client-shorts-screen" aria-label="Shorts">
      {/* The tab's one h1, as every other tab has; not drawn over the reels. */}
      <h1 className="sr-only">Shorts</h1>
      {reels.isPending && <div className="client-shorts-state"><p className="client-chats-notice" role="status">Loading…</p></div>}
      {reels.isError && !reels.data && <div className="client-shorts-state"><p className="client-chats-notice" role="alert">Could not load reels. <button onClick={() => { void reels.refetch(); }}>Try again</button></p></div>}
      {reels.data?.length === 0 && (
        <div className="client-shorts-state"><div className="client-chats-empty"><p>No reels yet. Valentina&apos;s first reels are on their way.</p></div></div>
      )}
      {reels.data && reels.data.length > 0 && <Reels reels={reels.data} />}
    </section>
  );
}

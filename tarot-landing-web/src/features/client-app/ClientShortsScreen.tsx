/* The Shorts tab: Valentina's reels, one at a time, full height, swiped up for
   the next the way Instagram Reels works. The reels come from the library shelf
   (GET /library-items/reels): the ones the client has not watched, newest
   first, then the ones she has, the least recently watched first. The reel at
   least 60 percent in view plays from its start; every other reel waits paused
   at 0. Sound is one switch for every reel, off until the client turns it on.
   The heart on each reel, or a double tap on it, keeps it in her Favourites
   (ROUND71); opened from there (?reel=key), the tab starts at that reel. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getReels, recordReelWatched, resolveLibraryMediaUrl, type ReelItem } from "@/features/sanctuary/api/libraryItemsApi";
import { useSanctuaryPlayer } from "@/features/sanctuary/SanctuaryPlayerProvider";
import { sanitizeClaims } from "@/lib/copy";
import { READERS_PATH, SHORTS_REEL_PARAM } from "./clientAppPaths";
import { HeartGlyph } from "./FavouriteHeart";
import ReelHeart from "./ReelHeart";
import { useReelLikes } from "./useReelLikes";
import "./client-chats.css";
import "./client-shorts.css";

/* How much of a slide must be in view before its reel is the one playing. */
const ACTIVE_RATIO = 0.6;

/* Only the reels this close to the one in view are given their poster and
   their video, so a long shelf costs a phone no more than a short one. Without
   an address a reel loads nothing, whatever the browser does with preload. */
const NEAR_REELS = 2;

/* How much of a reel must have played for it to count as watched. */
const WATCHED_SHARE = 0.9;

/* A second tap on a reel within this many milliseconds is a double tap, which
   likes it; a single tap pauses once this has passed without a second. */
const DOUBLE_TAP_MS = 300;

/* The reading button under every reel. The public reels page carries the same
   words (TAROT-BACKEND/app/routers/public_seo.py, GET_YOUR_READING). */
const GET_YOUR_READING = "Get your reading";

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
  near: boolean;
  paused: boolean;
  muted: boolean;
  onToggleSound: () => void;
  onTogglePause: () => void;
  onSoundRefused: () => void;
  onPlaying: () => void;
  onWatched: () => void;
}

function Reel({ reel, index, active, near, paused, muted, onToggleSound, onTogglePause, onSoundRefused, onPlaying, onWatched }: ReelProps) {
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

  const { isLiked, set: setLiked } = useReelLikes();
  // A first tap waits for a second one before it pauses the reel.
  const pendingTap = useRef<number | undefined>(undefined);
  const [burst, setBurst] = useState<{ id: number; x: number; y: number } | null>(null);

  // A waiting tap belongs to the reel in view: moving on, or leaving, drops it.
  useEffect(() => {
    const pending = pendingTap;
    return () => {
      window.clearTimeout(pending.current);
      pending.current = undefined;
    };
  }, [active]);

  const tap = (event: MouseEvent<HTMLDivElement>) => {
    if (!active) return;
    if (pendingTap.current === undefined) {
      pendingTap.current = window.setTimeout(() => {
        pendingTap.current = undefined;
        onTogglePause();
      }, DOUBLE_TAP_MS);
      return;
    }
    // The second tap: a heart where she tapped and a like, never an unlike, and no pause.
    window.clearTimeout(pendingTap.current);
    pendingTap.current = undefined;
    const stage = event.currentTarget.getBoundingClientRect();
    setBurst({ id: event.timeStamp, x: event.clientX - stage.left, y: event.clientY - stage.top });
    if (!isLiked(reel.key)) void setLiked(reel, true);
  };

  const showProgress = () => {
    const element = video.current;
    if (!element || !progress.current) return;
    const share = element.duration > 0 ? element.currentTime / element.duration : 0;
    progress.current.style.width = `${Math.min(share, 1) * 100}%`;
    // The reel loops, so it is counted on the way, before it starts again.
    if (active && share >= WATCHED_SHARE) onWatched();
  };

  const posterUrl = resolveLibraryMediaUrl(reel.cover_url);
  return (
    <div className="client-shorts-slide" data-index={index} data-reel-key={reel.key}>
      <div className="client-shorts-stage" onClick={tap}>
        <video
          ref={video}
          className="client-shorts-video"
          src={near ? resolveLibraryMediaUrl(reel.video_url) ?? undefined : undefined}
          poster={near ? posterUrl ?? undefined : undefined}
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
          <Link to={READERS_PATH} className="gl-btn-solid client-shorts-reading" onClick={event => event.stopPropagation()}>
            {GET_YOUR_READING}
          </Link>
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
        <ReelHeart reel={reel} className="client-shorts-like" />
        {burst && (
          <span key={burst.id} className="client-shorts-burst" style={{ left: burst.x, top: burst.y }} onAnimationEnd={() => setBurst(null)} aria-hidden="true">
            <HeartGlyph on />
          </span>
        )}
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
  // The reels told to the server this visit: each once, never awaited, and a
  // failure is let go.
  const recorded = useRef(new Set<string>());

  const recordWatched = (key: string) => {
    if (recorded.current.has(key)) return;
    recorded.current.add(key);
    recordReelWatched(key).catch(() => undefined);
  };

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
          near={Math.abs(index - active) <= NEAR_REELS}
          paused={pausedIndex === index}
          muted={muted}
          onToggleSound={() => setMuted(!muted)}
          onTogglePause={togglePause}
          onSoundRefused={() => setMuted(true)}
          onPlaying={() => { if (sanctuaryPlaying) pauseSanctuary(); }}
          onWatched={() => recordWatched(reel.key)}
        />
      ))}
    </div>
  );
}

/* Opened at a reel (a liked one, from Favourites): that reel first, then her
   feed as the tab would open it, without that reel. A reel no longer on the
   shelf opens the feed as usual. */
function startingAt(reels: ReelItem[] | undefined, key: string | null) {
  const first = key ? reels?.find(reel => reel.key === key) : undefined;
  return first && reels ? [first, ...reels.filter(reel => reel !== first)] : reels;
}

export default function ClientShortsScreen() {
  const [params] = useSearchParams();
  const startKey = params.get(SHORTS_REEL_PARAM);
  const reels = useQuery({
    queryKey: ["app-reels"],
    queryFn: getReels,
    // Her order changes as she watches: it is read afresh on every visit (kept
    // no longer than the tab is open) and holds still while she is here, since
    // a refetch must never move or restart the reel in view.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const feed = useMemo(() => startingAt(reels.data, startKey), [reels.data, startKey]);

  return (
    <section className="client-shorts-screen" aria-label="Shorts">
      {/* The tab's one h1, as every other tab has; not drawn over the reels. */}
      <h1 className="sr-only">Shorts</h1>
      {reels.isPending && <div className="client-shorts-state"><p className="client-chats-notice" role="status">Loading…</p></div>}
      {reels.isError && !reels.data && <div className="client-shorts-state"><p className="client-chats-notice" role="alert">Could not load reels. <button onClick={() => { void reels.refetch(); }}>Try again</button></p></div>}
      {reels.data?.length === 0 && (
        <div className="client-shorts-state"><div className="client-chats-empty"><p>No reels yet. Valentina&apos;s first reels are on their way.</p></div></div>
      )}
      {/* A new starting reel (the Shorts tab pressed on a reel opened from
          Favourites) starts the scroller afresh at the top. */}
      {feed && feed.length > 0 && <Reels key={startKey ?? ""} reels={feed} />}
    </section>
  );
}

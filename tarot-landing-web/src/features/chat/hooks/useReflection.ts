/* REFLECTION — the hold and the budget.

   While she reflects, the reader is not interrupted: generation keeps going,
   and what the reader writes is HELD here, in order, and not shown. When she
   returns the held messages are released one at a time with the thread's
   normal arrival treatment (typing dots, then the bubble rising in), never
   dumped as one block. The hold survives the panel being opened and closed
   any number of times: a queue that is still draining when she presses
   Reflect again simply stops where it is and resumes on the next Return.

   What passes straight through during a hold:
     - her own messages (they echo back from the server through the same
       event — they are hers, not the reader's),
     - system lines (state facts: accepted, paused, ended — never the reader
       speaking, and the room must not hide a billing fact behind a panel).
   What is swallowed during a hold: the reader's typing_start/stop. While
   draining, the hook drives the typing indicator itself and ignores the
   server's, so a stray typing_stop cannot cut a pulse short.

   If the reading stops being live while she reflects (ended, or paused by the
   server), the hold ends and the queue is released at once, in order — there
   is no reader arriving any more, only a thread to complete.

   THE SERVER IS THE AUTHORITY. When the caller hands in `server` figures
   (session_status REFLECTING, reflect_remaining_seconds, reflect_seconds_used,
   reflecting_since — from session-time, the on-connect session_info and the
   session_reflecting / session_reflect_ended broadcasts):
     - begin() opens the panel at once and POSTs /reflect; a 409 rolls it back,
     - ret() closes it at once, releases, and POSTs /reflect/return (idempotent),
     - remaining is the server's figure ticked down locally between syncs and
       re-anchored on every sync that carries it,
     - spent (the closing card's line) is the server's reflect_seconds_used,
       so it survives a hard refresh,
     - a server that reports REFLECTING while the panel is closed (a hard
       refresh mid-reflection) re-opens it, and lines that arrived after
       reflecting_since are re-held from the history load,
     - a session_reflect_ended from the server (reason budget) runs the very
       same path as her own time-up beat: `timeUp`, the beat, then ret().
   Without server figures (the dev injector, or an older backend) the budget
   is computed locally from reflectBudget.ts — the one arithmetic either way.

   At 0:00 mid-reflection (decision 1, final): `timeUp` goes true for a soft
   beat of TIME_UP_BEAT_MS, then the panel dismisses itself through ret() —
   the exact code Return runs. There is no second dismissal path. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  reflectEarnedSeconds,
  reflectRemainingSeconds,
} from "@/features/hall/reflectBudget";

export interface ReflectableMessage {
  id: string | number;
  content?: string;
  /** ISO timestamp, used to re-hold history lines after a refresh */
  created_at?: string;
  timestamp?: string;
}

/** The server's view, as the caller keeps it in sessionState. */
export interface ReflectionServer {
  /** true while session_status === "REFLECTING"; null until the server spoke */
  reflecting: boolean | null;
  /** reflect_remaining_seconds from the latest sync; null when never carried */
  remainingSeconds: number | null;
  /** reflect_seconds_used from the latest sync */
  secondsUsed: number | null;
  /** reflecting_since (ISO) from the latest sync, null when not reflecting */
  reflectingSince: string | null;
  /** the last session_reflect_ended the caller received, with a fresh id each */
  ended: { id: number; reason: string } | null;
  /** POST /chat/{id}/reflect — resolves with the figures, rejects on refusal */
  begin: () => Promise<unknown>;
  /** POST /chat/{id}/reflect/return — idempotent */
  ret: () => Promise<unknown>;
}

export interface UseReflectionOptions<M extends ReflectableMessage> {
  /** sessionState.elapsedSeconds — paid session time. */
  paidSeconds: number;
  /** May Reflect be begun right now (an active reading). */
  canBegin: boolean;
  /** True for a message the hold applies to: the reader's, not hers, not system. */
  isHeld: (m: M) => boolean;
  /** The thread's own add path — the same one a live message uses. */
  append: (m: M) => void;
  /** The thread's typing indicator. */
  setReaderTyping: (on: boolean) => void;
  /** The reading is no longer live: end the hold and release everything now. */
  flush: boolean;
  /** Changes when the conversation changes; everything resets. */
  resetKey: unknown;
  /** Spent seconds to start from (the dev injector's ?spent=; the live room
      never sets it). */
  initialSpentSeconds?: number;
  /** The server's figures. Absent (or never carrying remaining) → local. */
  server?: ReflectionServer | null;
}

/* The arrival pace on release. A pulse of typing scaled to the message, then
   the bubble, then a beat before the next. Real-room feel, not a dump. */
const TYPING_MIN_MS = 700;
const TYPING_PER_CHAR_MS = 12;
const TYPING_MAX_MS = 2200;
const BEAT_MS = 520;
/* How long "Your time is up" stays before the panel dismisses itself. */
const TIME_UP_BEAT_MS = 2500;
/* A sync can be answered by the server before our own POST landed. For this
   long after begin()/ret() resolved, a contradicting plain sync is ignored;
   the broadcasts (which carry a reason) are never ignored. */
const SETTLE_MS = 10000;

const msOf = (m: ReflectableMessage): number | null => {
  const t = m.created_at ?? m.timestamp;
  if (!t) return null;
  const v = Date.parse(t);
  return Number.isFinite(v) ? v : null;
};

export function useReflection<M extends ReflectableMessage>(o: UseReflectionOptions<M>) {
  const [reflecting, setReflecting] = useState(false);
  const [localSpent, setLocalSpent] = useState(() => Math.max(0, o.initialSpentSeconds ?? 0));
  const [heldCount, setHeldCount] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const [serverEndedSeen, setServerEndedSeen] = useState<number | null>(null);
  const initialSpentRef = useRef(o.initialSpentSeconds ?? 0);
  initialSpentRef.current = o.initialSpentSeconds ?? 0;

  const queue = useRef<M[]>([]);
  const reflectingRef = useRef(false);
  const drainingRef = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* latest callbacks, read by timers and by the stable admit() */
  const appendRef = useRef(o.append);
  const typingRef = useRef(o.setReaderTyping);
  const isHeldRef = useRef(o.isHeld);
  const canBeginRef = useRef(o.canBegin);
  const serverRef = useRef(o.server ?? null);
  appendRef.current = o.append;
  typingRef.current = o.setReaderTyping;
  isHeldRef.current = o.isHeld;
  canBeginRef.current = o.canBegin;
  serverRef.current = o.server ?? null;

  /* ── the server's figures, anchored ─────────────────────────────────────── */
  const server = o.server ?? null;
  const fed = !!server && server.remainingSeconds != null;
  const anchor = useRef<{ remaining: number; at: number } | null>(null);
  const [fedRemaining, setFedRemaining] = useState<number | null>(null);
  const beginSettledAt = useRef(0);
  const retSettledAt = useRef(0);
  const pendingBegin = useRef(false);
  const pendingRet = useRef(false);

  /* re-anchor on every sync that carries the figure (the value changes on
     every poll while reflecting; when it does not, nothing to re-anchor) */
  useEffect(() => {
    if (!fed) { anchor.current = null; setFedRemaining(null); return; }
    anchor.current = { remaining: Math.max(0, server!.remainingSeconds!), at: Date.now() };
    setFedRemaining(anchor.current.remaining);
  }, [fed, server?.remainingSeconds, server?.secondsUsed, server?.reflecting]);

  /* tick the anchored figure down while reflecting */
  useEffect(() => {
    if (!fed || !reflecting) return;
    const t = setInterval(() => {
      const a = anchor.current; if (!a) return;
      setFedRemaining(Math.max(0, a.remaining - Math.floor((Date.now() - a.at) / 1000)));
    }, 250);
    return () => clearInterval(t);
  }, [fed, reflecting]);

  const earnedSeconds = reflectEarnedSeconds(o.paidSeconds);
  const localRemaining = reflectRemainingSeconds(o.paidSeconds, localSpent);
  const remainingSeconds = fed ? (fedRemaining ?? Math.max(0, server!.remainingSeconds!)) : localRemaining;
  const liveSinceAnchor = fed && reflecting && anchor.current
    ? Math.max(0, Math.floor((Date.now() - anchor.current.at) / 1000)) : 0;
  const spentSeconds = fed ? Math.max(0, (server!.secondsUsed ?? 0) + liveSinceAnchor) : localSpent;

  const earnedRef = useRef(earnedSeconds);
  earnedRef.current = earnedSeconds;
  const remainingRef = useRef(remainingSeconds);
  remainingRef.current = remainingSeconds;

  const clearTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  /** Stop a drain in flight without losing its head: the message being
      "typed" was only peeked, so it is still first in the queue. */
  const cancelDrain = useCallback(() => {
    generation.current += 1;
    clearTimer();
    if (drainingRef.current) {
      drainingRef.current = false;
      typingRef.current(false);
    }
  }, []);

  /** Release the queue in order, each with the normal arrival treatment. */
  const drain = useCallback(() => {
    if (drainingRef.current) return;
    if (queue.current.length === 0) { setHeldCount(0); return; }
    const mine = ++generation.current;
    drainingRef.current = true;
    const step = () => {
      if (generation.current !== mine) return;
      if (reflectingRef.current) { drainingRef.current = false; return; }
      const head = queue.current[0];
      if (!head) {
        drainingRef.current = false;
        setHeldCount(0);
        typingRef.current(false);
        return;
      }
      typingRef.current(true);
      const dwell = Math.min(
        TYPING_MAX_MS,
        TYPING_MIN_MS + String(head.content ?? "").length * TYPING_PER_CHAR_MS,
      );
      timer.current = setTimeout(() => {
        if (generation.current !== mine) return;
        typingRef.current(false);
        queue.current.shift();
        setHeldCount(queue.current.length);
        appendRef.current(head);
        timer.current = setTimeout(step, BEAT_MS);
      }, dwell);
    };
    step();
  }, []);

  /** Everything out, now, in order. For a reading that is no longer live. */
  const flushNow = useCallback(() => {
    cancelDrain();
    reflectingRef.current = false;
    setReflecting(false);
    const all = queue.current.splice(0, queue.current.length);
    for (const m of all) appendRef.current(m);
    setHeldCount(0);
    typingRef.current(false);
  }, [cancelDrain]);

  /** The gate. True = the caller adds the message to the thread now.
      False = it is held here. Stable, so the socket handler can stay stable. */
  const admit = useCallback((m: M): boolean => {
    if (!isHeldRef.current(m)) return true;
    const holding = reflectingRef.current || drainingRef.current || queue.current.length > 0;
    if (!holding) return true;
    if (!queue.current.some((q) => q.id === m.id)) {
      queue.current.push(m);
      setHeldCount(queue.current.length);
    }
    return false;
  }, []);

  /** After a hard refresh mid-reflection the history load brings back lines
      the reader wrote after reflecting_since. Hold those (in order) and return
      the rest for the thread. A no-op when not reflecting or without the
      server's timestamp. Idempotent: already-held ids are not re-queued. */
  const holdFromHistory = useCallback((list: M[]): M[] => {
    const since = serverRef.current?.reflectingSince;
    if (!reflectingRef.current || !since) return list;
    const sinceMs = Date.parse(since);
    if (!Number.isFinite(sinceMs)) return list;
    const shown: M[] = [];
    for (const m of list) {
      const at = msOf(m);
      if (isHeldRef.current(m) && at != null && at >= sinceMs) {
        if (!queue.current.some((q) => q.id === m.id)) queue.current.push(m);
      } else {
        shown.push(m);
      }
    }
    setHeldCount(queue.current.length);
    return shown;
  }, []);

  /** May the server's typing indicator be shown right now. */
  const canShowTyping = useCallback(
    () => !reflectingRef.current && !drainingRef.current && queue.current.length === 0,
    [],
  );

  const begin = useCallback(() => {
    if (!canBeginRef.current) return;
    if (reflectingRef.current) return;
    if (remainingRef.current <= 0) return;   /* present but quiet at 0:00 */
    cancelDrain();
    reflectingRef.current = true;
    setReflecting(true);
    const s = serverRef.current;
    if (s) {
      pendingBegin.current = true;
      s.begin()
        .then(() => { beginSettledAt.current = Date.now(); })
        .catch((err: any) => {
          /* refused (409: no_budget, grace, …) or failed: roll the panel back */
          const status = err?.response?.status;
          if (status === 409 || status === 403 || status === 404) {
            reflectingRef.current = false;
            setReflecting(false);
            drain();
          }
        })
        .finally(() => { pendingBegin.current = false; });
    }
  }, [cancelDrain, drain]);

  const ret = useCallback(() => {
    if (!reflectingRef.current) return;
    reflectingRef.current = false;
    setReflecting(false);
    drain();
    const s = serverRef.current;
    if (s) {
      pendingRet.current = true;
      s.ret()
        .catch(() => { /* idempotent on the server; the next sync re-syncs */ })
        .finally(() => { pendingRet.current = false; retSettledAt.current = Date.now(); });
    }
  }, [drain]);

  /* local spent accrues only while reflecting, one second at a time, never past earned */
  useEffect(() => {
    if (!reflecting || fed) return;
    const t = setInterval(() => {
      setLocalSpent((s) => Math.min(earnedRef.current, s + 1));
    }, 1000);
    return () => clearInterval(t);
  }, [reflecting, fed]);

  /* ── the server's word ───────────────────────────────────────────────────
     REFLECTING while the panel is closed → re-open it (a hard refresh, or
     another tab). Not reflecting while the panel is open, past the settle
     window → the server ended it: the same exit as the time-up beat. */
  const serverSaysReflecting = server?.reflecting ?? null;
  const serverEndedId = server?.ended?.id ?? null;
  useEffect(() => {
    if (serverSaysReflecting == null) return;
    const now = Date.now();
    if (serverSaysReflecting && !reflectingRef.current) {
      if (pendingRet.current || now - retSettledAt.current < SETTLE_MS) return;
      if (!canBeginRef.current) return;
      cancelDrain();
      reflectingRef.current = true;
      setReflecting(true);
      return;
    }
    if (!serverSaysReflecting && reflectingRef.current) {
      if (pendingBegin.current || now - beginSettledAt.current < SETTLE_MS) return;
      setServerEndedSeen(now);
    }
  }, [serverSaysReflecting, server?.remainingSeconds, cancelDrain]);
  useEffect(() => {
    if (serverEndedId == null) return;
    if (reflectingRef.current) setServerEndedSeen(Date.now());
  }, [serverEndedId]);

  /* 0:00 mid-reflection, or the server ending it: the beat, then Return's own
     code. Pressing Return during the beat simply wins — reflecting flips, the
     timer is cleared. */
  const exhausted = reflecting && (remainingSeconds <= 0 || serverEndedSeen != null);
  useEffect(() => {
    if (!exhausted) { setTimeUp(false); return; }
    setTimeUp(true);
    const t = setTimeout(() => { setTimeUp(false); setServerEndedSeen(null); ret(); }, TIME_UP_BEAT_MS);
    return () => clearTimeout(t);
  }, [exhausted, ret]);
  useEffect(() => { if (!reflecting) setServerEndedSeen(null); }, [reflecting]);

  /* the reading stopped being live: end the hold, release everything */
  useEffect(() => {
    if (o.flush && (reflectingRef.current || queue.current.length > 0)) flushNow();
  }, [o.flush, flushNow]);

  /* another conversation: nothing carries over */
  useEffect(() => {
    cancelDrain();
    queue.current = [];
    reflectingRef.current = false;
    setReflecting(false);
    setLocalSpent(Math.max(0, initialSpentRef.current));
    setHeldCount(0);
    setServerEndedSeen(null);
  }, [o.resetKey, cancelDrain]);

  useEffect(() => () => { generation.current += 1; clearTimer(); }, []);

  return useMemo(() => ({
    reflecting,
    timeUp,
    spentSeconds,
    earnedSeconds,
    remainingSeconds,
    heldCount,
    /** true when the figures are the server's */
    serverFed: fed,
    begin,
    ret,
    admit,
    holdFromHistory,
    canShowTyping,
  }), [reflecting, timeUp, spentSeconds, earnedSeconds, remainingSeconds, heldCount, fed, begin, ret, admit, holdFromHistory, canShowTyping]);
}

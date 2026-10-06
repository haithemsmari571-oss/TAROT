/* The visit and its asks (ROUND59), shared by every screen of the app in this
   page. A visit starts when the page loads, and again when she comes back to
   the app after more than NEW_VISIT_AFTER_MS away (the page out of sight).
   What a visit asks is appAsks.ts; the sheets and the pill are AppSheets.tsx.

   Nothing here runs when the module loads: AV Admin imports AppSheets.tsx for
   its Share steps, and the listener starts with the app's own sheets
   (AppAsks). The per-device record is kept in localStorage, and the app works
   the same when storage throws (private mode, a full disk). */
import { useEffect, useSyncExternalStore } from "react";
import { readPushAgain } from "@/features/push/webPush";
import { freshVisit, isNewVisit, type VisitAsks } from "./appAsks";

interface Snapshot {
  /** 1 for the page load, one more for each new visit after it */
  visit: number;
  asks: VisitAsks;
  /** the reader of the room she is in, once she has written there */
  roomReader: string | null;
  /** a message she has just sent, to that reader, waiting for the sheets to read it */
  sentTo: string | null;
  /** the pill has finished on this device (appAsks.ts pillFinished) */
  pillDone: boolean;
}

const PILL_DONE_KEY = "av-app-pill-done";
function readPillDone(): boolean {
  try { return localStorage.getItem(PILL_DONE_KEY) === "1"; } catch { return false; }
}

let snapshot: Snapshot | null = null;
const readers = new Set<() => void>();
let hiddenAt: number | null = null;
let listening = false;

function current(): Snapshot {
  snapshot ??= { visit: 1, asks: freshVisit(), roomReader: null, sentTo: null, pillDone: readPillDone() };
  return snapshot;
}
function change(next: Partial<Snapshot>) {
  snapshot = { ...current(), ...next };
  readers.forEach(read => read());
}

/* Out of sight, the moment is noted; back in front, a new visit when she was
   away long enough. Either way the browser's notification answer is read
   again, since she may have changed it in the settings meanwhile. */
function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt;
    hiddenAt = null;
    if (isNewVisit(away, Date.now())) change({ visit: current().visit + 1, asks: freshVisit() });
    readPushAgain();
  });
}

function onChange(read: () => void) {
  listen();
  readers.add(read);
  return () => { readers.delete(read); };
}

export function useAppAsksState(): Snapshot {
  return useSyncExternalStore(onChange, current);
}

export function updateAsks(step: (asks: VisitAsks) => VisitAsks) {
  change({ asks: step(current().asks) });
}
export const takeSentTo = () => change({ sentTo: null });

export function markPillDone() {
  try { localStorage.setItem(PILL_DONE_KEY, "1"); } catch { /* storage refused: it is worked out again next time */ }
  change({ pillDone: true });
}

/* Screens that hold the asks back while true: the room while its composer has
   text in it. */
const holds = new Set<object>();
export function useHoldAsks(hold: boolean) {
  useEffect(() => {
    if (!hold) return;
    const token = {};
    holds.add(token);
    return () => { holds.delete(token); };
  }, [hold]);
}

/* The room: the reader she writes to (once she has written there), the
   messages she sends (`sent` counts them since the room opened), and her
   draft holding every ask back. */
export function useRoomAsks(reader: string, wroteHere: boolean, sent: number, draft: string) {
  useEffect(() => {
    change({ roomReader: wroteHere ? reader : null });
    return () => change({ roomReader: null });
  }, [reader, wroteHere]);
  useEffect(() => {
    if (sent > 0) change({ sentTo: reader });
    // Only a new message counts; the reader is read as it stands then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent]);
  useHoldAsks(draft !== "");
}

/* Text fields: while one has the focus she is typing (the composer, the Home
   search), and no sheet may open. */
const TYPING = "input:not([type]), input[type=text], input[type=search], input[type=email], input[type=tel], input[type=url], input[type=number], input[type=password], textarea, [contenteditable]:not([contenteditable=false])";
/* Anything modal already open: another sheet, a dialog, the payment window
   (TopUpContext.tsx, role dialog), the Sanctuary's now-playing view. */
const MODAL_OPEN = "dialog[open], [aria-modal=true]";

/** A moment a sheet may open: the app in front, nobody typing, nothing modal open. */
export function calmNow(): boolean {
  if (document.visibilityState !== "visible" || holds.size > 0) return false;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches(TYPING)) return false;
  return !document.querySelector(MODAL_OPEN);
}

/* The app's two suggestions (ROUND57), each a glass sheet at the foot of the
   screen, never one over the other:
   - NotifyAskSheet, in a conversation, after she has sent a message: "Want to
     know the moment <reader> replies?". Yes asks the browser, then subscribes
     (push/webPush.ts). On an iPhone in Safari, where only the home-screen app
     can receive notifications, it shows the two steps to add it instead.
   - InstallSheet, on arriving in the app: "Add Ask Valentina to your home
     screen", one tap on Android and Chrome (useInstallPrompt.ts), the two
     steps on an iPhone, never from the home screen itself.
   Each shows at most SHEET_TIMES times per account in this browser, at least
   SHEET_GAP_DAYS apart (the ask only ever after a message she sent). A yes, or
   a browser that already said no, ends the asking for good.

   Modal dialogs, so they sit in the top layer over the tab bar and the room:
   the confirm sheet's recipe (client-sheets.css). */
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useAuth } from "@/features/auth/hooks";
import { usePush } from "@/features/push/webPush";
import { BRAND_NAME } from "@/lib/company";
import { useInstallPrompt } from "./useInstallPrompt";
import "../../styles/glass.css";
import "./client-sheets.css";

export const SHEET_TIMES = 3;
export const SHEET_GAP_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SHEET_COPY = {
  ask: (reader: string) => `Want to know the moment ${reader} replies?`,
  yes: "Yes, notify me",
  notNow: "Not now",
  askOnIphone: `Add ${BRAND_NAME} to your home screen first:`,
  install: `Add ${BRAND_NAME} to your home screen`,
  installButton: "Install",
} as const;

/* Safari's own two taps to add a page to the home screen; the Share symbol
   goes after the first (HomeScreenSteps). Also the You tab's sheet. */
export const HOME_SCREEN_STEPS = ["Tap the Share button", "Tap “Add to Home Screen”."] as const;

/* Safari's Share symbol, a square with an arrow out of its top, in the system
   blue it has in Safari (client-sheets.css), so she knows it when she sees it. */
export function ShareIcon() {
  return (
    <svg className="av-share-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Share">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M7.5 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5h-1.5" />
    </svg>
  );
}

export function HomeScreenSteps() {
  return (
    <ol className="av-sheet-steps">
      <li>{HOME_SCREEN_STEPS[0]} <ShareIcon />.</li>
      <li>{HOME_SCREEN_STEPS[1]}</li>
    </ol>
  );
}

/* ── How often, per account, in this browser ── */
type SheetKind = "notify-ask" | "install";
interface Shown { times: number; last: number; done?: boolean }

const storageKey = (kind: SheetKind, userId: number) => `av-${kind}:${userId}`;

function shownOf(kind: SheetKind, userId: number): Shown {
  try {
    const kept = JSON.parse(localStorage.getItem(storageKey(kind, userId)) ?? "null") as Shown | null;
    return kept && typeof kept.times === "number" ? kept : { times: 0, last: 0 };
  } catch {
    return { times: 0, last: 0 };
  }
}

function keep(kind: SheetKind, userId: number, shown: Shown) {
  try { localStorage.setItem(storageKey(kind, userId), JSON.stringify(shown)); } catch { /* private mode: asks again next time */ }
}

function mayShow(kind: SheetKind, userId: number, now = Date.now()): boolean {
  const shown = shownOf(kind, userId);
  return !shown.done && shown.times < SHEET_TIMES && (shown.times === 0 || now - shown.last >= SHEET_GAP_DAYS * DAY_MS);
}

function noteShown(kind: SheetKind, userId: number) {
  const shown = shownOf(kind, userId);
  keep(kind, userId, { ...shown, times: shown.times + 1, last: Date.now() });
}

function noteDone(kind: SheetKind, userId: number) {
  keep(kind, userId, { ...shownOf(kind, userId), done: true });
}

/* One sheet at a time across the app: the install sheet never opens over the
   notification sheet, nor the other way round. */
let sheetOpen: SheetKind | null = null;

/* The dialog element is the sheet's one state: opened with showModal by the
   sheet's rule, closed by its buttons, the scrim or Escape. A tap on the scrim
   lands on the dialog itself; every way out counts as Not now. It takes the
   focus itself on opening, so its title is read out and no button wears a
   focus ring before she touches it. */
function Sheet({ dialogRef, kind, label, children }: { dialogRef: RefObject<HTMLDialogElement | null>; kind: SheetKind; label: string; children: ReactNode }) {
  // Leaving the screen with the sheet open closes it without a close event.
  useEffect(() => () => { if (sheetOpen === kind) sheetOpen = null; }, [kind]);
  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      className="av-sheet"
      aria-labelledby={label}
      data-sheet={kind}
      onClose={() => { if (sheetOpen === kind) sheetOpen = null; }}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
    >
      <div className="av-sheet-body">{children}</div>
    </dialog>
  );
}

function openSheet(kind: SheetKind, userId: number, dialog: HTMLDialogElement | null) {
  if (!dialog || dialog.open) return;
  sheetOpen = kind;
  noteShown(kind, userId);
  dialog.showModal();
  dialog.focus();
}

/* In a conversation: `sent` counts the messages she has sent since the room
   opened; each one may bring the ask. */
export function NotifyAskSheet({ readerName, sent }: { readerName: string; sent: number }) {
  const { user } = useAuth();
  const push = usePush("client");
  const dialog = useRef<HTMLDialogElement>(null);
  const userId = user?.id;
  const iphone = push.state === "home-screen-first";
  // Only a browser that has never answered the question, or an iPhone tab.
  const askable = (push.state === "off" && push.permission === "default") || iphone;

  useEffect(() => {
    if (!sent || !userId || !askable || sheetOpen || !mayShow("notify-ask", userId)) return;
    openSheet("notify-ask", userId, dialog.current);
    // Only a new message brings it; the rest is read as it stands then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent]);

  const close = () => dialog.current?.close();
  const yes = async () => {
    const answer = await push.turnOn();
    if (userId && (answer === "on" || answer === "blocked")) noteDone("notify-ask", userId);
    close();
  };

  return (
    <Sheet dialogRef={dialog} kind="notify-ask" label="av-notify-ask-title">
      <h2 id="av-notify-ask-title" className="av-sheet-title">{SHEET_COPY.ask(readerName)}</h2>
      {iphone && (
        <>
          <p className="av-sheet-line">{SHEET_COPY.askOnIphone}</p>
          <HomeScreenSteps />
        </>
      )}
      <div className="av-sheet-actions">
        {!iphone && (
          <button type="button" className="av-sheet-yes" onClick={yes} disabled={push.busy} aria-busy={push.busy}>{SHEET_COPY.yes}</button>
        )}
        <button type="button" className="av-sheet-no" onClick={close}>{SHEET_COPY.notNow}</button>
      </div>
    </Sheet>
  );
}

/* On arriving in the app, signed in: once per visit at most. */
export function InstallSheet() {
  const { user } = useAuth();
  const install = useInstallPrompt();
  const dialog = useRef<HTMLDialogElement>(null);
  const shown = useRef(false);
  const userId = user?.id;
  const route = install.route;

  useEffect(() => {
    if (shown.current || !userId || !route || sheetOpen || !mayShow("install", userId)) return;
    shown.current = true;
    openSheet("install", userId, dialog.current);
  }, [userId, route]);

  const close = () => dialog.current?.close();
  const installNow = () => {
    install.prompt();
    close();
  };

  return (
    <Sheet dialogRef={dialog} kind="install" label="av-install-title">
      <h2 id="av-install-title" className="av-sheet-title">{SHEET_COPY.install}</h2>
      {route === "share-steps" && <HomeScreenSteps />}
      <div className="av-sheet-actions">
        {route === "prompt" && <button type="button" className="av-sheet-yes" onClick={installNow}>{SHEET_COPY.installButton}</button>}
        <button type="button" className="av-sheet-no" onClick={close}>{SHEET_COPY.notNow}</button>
      </div>
    </Sheet>
  );
}

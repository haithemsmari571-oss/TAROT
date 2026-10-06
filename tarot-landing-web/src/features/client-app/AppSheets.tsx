/* The app's asks (ROUND57, ROUND59): a glass sheet at the foot of the screen,
   at most one at a time, and the small pill at the top of Home and Chats.

   On every visit (useAppAsks.ts), once she is signed in, AppAsks shows at most
   one sheet, in the order of appAsks.ts visitAsk:
   - the install sheet, until the app runs from the home screen: one Install
     tap where Chrome offers it (useInstallPrompt.ts), and on an iPhone or iPad
     the big two-step guide, with an arrow at Safari's Share button;
   - else the notification sheet, while notifications are off and the browser
     has not blocked them: "Never miss a reply from your reader" until she has
     written to a reader, then "Want to know the moment <reader> replies?".
     Yes goes straight to the browser's own question (push/webPush.ts).
   Her first message of a visit can bring the ask once more, unless the visit
   has already shown that sheet. "Not now" closes a sheet until the next visit.
   A sheet only opens after SETTLE_MS of calm: nobody typing, no text in the
   room's composer, no other sheet, dialog or payment window open.

   The pill (AppPill): "Get the app", then "Turn on alerts", then gone for
   good on this device; "Alerts blocked" opens the steps to undo the browser's
   no. One sheet, a modal dialog in the top layer over the tab bar and the
   room: the confirm sheet's recipe (client-sheets.css). */
import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks";
import { usePush } from "@/features/push/webPush";
import { BRAND_NAME } from "@/lib/company";
import {
  askApplies, BLOCKED_STEPS, blockedPlace, decideVisit, messageSent, opened, pillFinished, pillState,
  SETTLE_MS, sharePlace, type AskSheet, type PillState, type WaitingAsk,
} from "./appAsks";
import { readerDisplayName } from "./readerName";
import { calmNow, markPillDone, takeSentTo, updateAsks, useAppAsksState } from "./useAppAsks";
import { getInboxPage } from "./useClientInbox";
import { runsStandalone, useInstallPrompt, type InstallRoute } from "./useInstallPrompt";
import "../../styles/glass.css";
import "./client-sheets.css";

/** How often a waiting sheet looks for its calm moment. */
const CALM_CHECK_MS = 250;

/* Safari's own words for the menu row that adds a page to the home screen. */
const ADD_TO_HOME_SCREEN = "Add to Home Screen";

export const SHEET_COPY = {
  ask: (reader: string) => `Want to know the moment ${reader} replies?`,
  askBeforeFirst: "Never miss a reply from your reader",
  yes: "Yes, notify me",
  notNow: "Not now",
  install: `Add ${BRAND_NAME} to your home screen`,
  installButton: "Install",
  gotIt: "Got it",
  blocked: "Alerts are blocked",
  blockedLine: "To turn them back on:",
  pill: { install: "Get the app", alerts: "Turn on alerts", blocked: "Alerts blocked" },
} as const;

/* Safari's own two taps to add a page to the home screen; the Share symbol
   goes after the first (HomeScreenSteps). Also the You tab's sheet and AV
   Admin's Alerts card. */
export const HOME_SCREEN_STEPS = ["Tap the Share button", `Tap “${ADD_TO_HOME_SCREEN}”.`] as const;

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

/* The symbol beside "Add to Home Screen" in Safari's menu: a plus in a square. */
function AddToHomeIcon() {
  return (
    <svg className="av-add-home-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
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

/* The arrow at Safari's Share button: down at the bar along the foot of an
   iPhone's screen, up at the top right of an iPad's. It bobs towards it. */
function ShareArrow() {
  return (
    <span className="av-guide-arrow" aria-hidden="true">
      <svg width="34" height="46" viewBox="0 0 34 46" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3v38" />
        <path d="M5 29l12 12 12-12" />
      </svg>
    </span>
  );
}

/* The iPhone and iPad guide: the two steps, large, each with what she will
   see in Safari. */
function HomeScreenGuide() {
  return (
    <ol className="av-guide">
      <li>
        <span className="av-guide-text">{HOME_SCREEN_STEPS[0]}</span>
        <span className="av-guide-picture"><ShareIcon /></span>
      </li>
      <li>
        <span className="av-guide-text">{HOME_SCREEN_STEPS[1]}</span>
        <span className="av-guide-picture av-guide-menu-row">{ADD_TO_HOME_SCREEN}<AddToHomeIcon /></span>
      </li>
    </ol>
  );
}

/* The sheet on screen: an ask, or the steps behind "Alerts blocked". The
   install sheet keeps the route it opened with. */
type OpenSheet =
  | { sheet: "install"; route: Exclude<InstallRoute, null> }
  | { sheet: "notify"; reader: string | null }
  | { sheet: "blocked" };

/* The pill opens its sheet in the shell's one dialog (AppAsks). */
let openFromPill: ((sheet: "install" | "blocked") => void) | null = null;

/* Her reader for the notification sheet: the room's when she has written
   there, else the reader of her latest conversation she has written in. */
async function lastReaderWritten(signal: AbortSignal): Promise<string | null> {
  const page = await getInboxPage(0, signal);
  const mine = page.items.find(conversation => conversation.client_last_message_state !== null);
  return mine ? readerDisplayName(mine.reader.display_name) : null;
}

/* Mounted once, in the app's shell (ClientAppShell.tsx). */
export function AppAsks() {
  const { user } = useAuth();
  const userId = user?.id;
  const install = useInstallPrompt();
  const push = usePush("client");
  const state = useAppAsksState();
  const { pathname } = useLocation();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState<OpenSheet | null>(null);

  // Looked up once a visit, and only while a notification sheet may come.
  const lastReader = useQuery({
    queryKey: ["client-app-ask-reader", userId, state.visit],
    enabled: !!userId && push.state === "off",
    queryFn: ({ signal }) => lastReaderWritten(signal),
    staleTime: Infinity,
    retry: false,
  });

  const latest = useRef({ route: install.route, push: push.state, roomReader: state.roomReader, lastReader: lastReader.data ?? null });
  useEffect(() => {
    latest.current = { route: install.route, push: push.state, roomReader: state.roomReader, lastReader: lastReader.data ?? null };
  });

  const show = (sheet: AskSheet | "blocked", reader: string | null = null) => {
    const { route } = latest.current;
    if (sheet === "install") { if (route) setOpen({ sheet, route }); }
    else setOpen(sheet === "notify" ? { sheet, reader } : { sheet });
  };

  // The pill's sheets open at once: she asked for them.
  useEffect(() => {
    openFromPill = sheet => {
      if (dialog.current?.open) return;
      if (sheet === "install") updateAsks(asks => opened(asks, "install"));
      show(sheet);
    };
    return () => { openFromPill = null; };
  });

  // Her first message of the visit may bring the ask (appAsks.ts messageSent).
  useEffect(() => {
    const reader = state.sentTo;
    if (!reader) return;
    takeSentTo();
    updateAsks(asks => messageSent(asks, install.route, push.state, reader));
    // Read as things stand when the message went.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sentTo]);

  /* A sheet is due: one waiting, or the visit's own still to come once push
     is known (and her reader, while it is being looked up). It opens after
     SETTLE_MS of calm on this screen; another screen starts the wait again. */
  const { waiting, decided } = state.asks;
  const due = !!userId && (waiting !== null || (!decided && push.state !== "checking")) && lastReader.fetchStatus !== "fetching";
  useEffect(() => {
    if (!due) return;
    // From the first check that finds it calm, so the wait is never shorter.
    let calmSince: number | null = null;
    const timer = window.setInterval(() => {
      if (!calmNow()) { calmSince = null; return; }
      calmSince ??= Date.now();
      if (Date.now() - calmSince < SETTLE_MS) return;
      window.clearInterval(timer);
      const { route, push: pushNow, roomReader, lastReader: reader } = latest.current;
      let chosen = null as WaitingAsk | null;
      updateAsks(asks => {
        const next = asks.waiting ? asks : decideVisit(asks, route, pushNow);
        const ask = next.waiting;
        if (!ask || !askApplies(ask.sheet, route, pushNow)) return { ...next, decided: true, waiting: null };
        chosen = ask;
        return opened(next, ask.sheet);
      });
      if (chosen) show(chosen.sheet, chosen.reader ?? roomReader ?? reader);
    }, CALM_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [due, pathname, state.visit]);

  // Notifications on, nothing left to add: the pill is finished on this device.
  const finished = decided && pillFinished(install.route, push.state, install.offered);
  useEffect(() => { if (finished && !state.pillDone) markPillDone(); }, [finished, state.pillDone]);

  // The dialog follows `open`; every way out (a button, the scrim, Escape) closes it.
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element || element.open) return;
    element.showModal();
    element.focus();
  }, [open]);
  const close = () => dialog.current?.close();

  const yes = async () => {
    await push.turnOn();
    close();
  };
  const installNow = () => {
    install.prompt();
    close();
  };

  const place = open?.sheet === "install" && open.route === "share-steps" ? sharePlace(navigator.userAgent, navigator.maxTouchPoints) : null;

  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="av-sheet"
      aria-labelledby={titleId}
      data-sheet={open?.sheet}
      data-guide={open?.sheet === "install" && open.route === "share-steps" ? "" : undefined}
      data-share-place={place ?? undefined}
      onClose={() => setOpen(null)}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
    >
      {open && (
        <div className="av-sheet-body">
          {place === "top-right" && <ShareArrow />}
          {open.sheet === "install" && (
            <>
              <h2 id={titleId} className="av-sheet-title">{SHEET_COPY.install}</h2>
              {open.route === "share-steps" ? (
                <>
                  <HomeScreenGuide />
                  <div className="av-sheet-actions">
                    <button type="button" className="av-sheet-yes" onClick={close}>{SHEET_COPY.gotIt}</button>
                  </div>
                </>
              ) : (
                <div className="av-sheet-actions">
                  <button type="button" className="av-sheet-yes" onClick={installNow}>{SHEET_COPY.installButton}</button>
                  <button type="button" className="av-sheet-no" onClick={close}>{SHEET_COPY.notNow}</button>
                </div>
              )}
            </>
          )}
          {open.sheet === "notify" && (
            <>
              <h2 id={titleId} className="av-sheet-title">{open.reader ? SHEET_COPY.ask(open.reader) : SHEET_COPY.askBeforeFirst}</h2>
              <div className="av-sheet-actions">
                <button type="button" className="av-sheet-yes" onClick={yes} disabled={push.busy} aria-busy={push.busy}>{SHEET_COPY.yes}</button>
                <button type="button" className="av-sheet-no" onClick={close}>{SHEET_COPY.notNow}</button>
              </div>
            </>
          )}
          {open.sheet === "blocked" && (
            <>
              <h2 id={titleId} className="av-sheet-title">{SHEET_COPY.blocked}</h2>
              <p className="av-sheet-line">{SHEET_COPY.blockedLine}</p>
              <ol className="av-sheet-steps">
                {BLOCKED_STEPS[blockedPlace(navigator.userAgent, navigator.maxTouchPoints, runsStandalone())](BRAND_NAME, window.location.host)
                  .map(step => <li key={step}>{step}</li>)}
              </ol>
              <div className="av-sheet-actions">
                <button type="button" className="av-sheet-yes" onClick={close}>{SHEET_COPY.gotIt}</button>
              </div>
            </>
          )}
          {place === "bottom" && <ShareArrow />}
        </div>
      )}
    </dialog>
  );
}

function PillIcon({ pill }: { pill: Exclude<PillState, null> }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {pill === "install" ? (
        <><path d="M12 4v10" /><path d="M8 10l4 4 4-4" /><path d="M5 19.5h14" /></>
      ) : (
        <>
          <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14l1.5-1.5Z" />
          <path d="M10 20.5a2 2 0 0 0 4 0" />
          {pill === "blocked" && <path d="M4 4l16 16" />}
        </>
      )}
    </svg>
  );
}

/* At the top of Home and Chats, beside the title. Install opens the install
   sheet, alerts goes straight to the browser's question, blocked opens the
   steps for her browser. */
export function AppPill() {
  const install = useInstallPrompt();
  const push = usePush("client");
  const { pillDone } = useAppAsksState();
  const pill = pillState(install.route, push.state, pillDone);
  if (!pill) return null;
  const tap = () => {
    if (pill !== "alerts") { openFromPill?.(pill); return; }
    void push.turnOn();
    updateAsks(asks => opened(asks, "notify"));
  };
  return (
    <button type="button" className="av-app-pill" data-pill={pill} onClick={tap} disabled={push.busy} aria-busy={push.busy}>
      <PillIcon pill={pill} />
      <span>{SHEET_COPY.pill[pill]}</span>
    </button>
  );
}

/* The reading room, drawn as the hall.

   PRESENTATION ONLY. This component owns no timer, makes no request, and knows
   nothing about money. Everything it shows arrives as a prop and everything it
   offers is a callback back into ClientChat, which still runs the session
   exactly as it did before. If a prop is missing, the state simply does not
   draw — it can never charge anything by accident.

   The states it covers are numbered against ROOM-STATES.md. */

import { useContext, useEffect, useRef } from "react";
import "../../styles/hall.css";
import "../../styles/hall-room.css";
import "../../styles/hall-list.css";
import { type HallReceipt } from "./startHall";
import { HallRuntimeContext } from "./HallStage";
import { setHallSheetEnabled } from "./hallSheet";
import { formatMinutesLeft } from "@/lib/currency";

export type RoomPhase = "room" | "pausing" | "ended";

export interface HallRoomMessage {
  id: string | number;
  mine: boolean;
  text: string;
  time?: string;
  /** #22 — a system/event line ("Valentina accepted the chat request"). The old
      room drew these as a centred muted pill, never as the reader speaking. */
  system?: boolean;
}

export interface HallRoomProps {
  phase: RoomPhase;
  readerName: string;
  readerPhoto?: string | null;

  /* the meter — #9..#13, #17 */
  minutesLeft: number | null;
  isPaused: boolean;
  elapsedLabel: string;
  /** DEFECT 2 — what she has spent so far, already formatted ("£4.20").
      Read from sessionState.estimatedCost, the SAME field the closing card
      latches — one constant, one source. */
  spentLabel?: string | null;

  /* the connection — #15, #16 */
  isConnected: boolean;

  /* the thread — #18..#26 */
  messages: HallRoomMessage[];
  loadingMessages?: boolean;
  readerTyping?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** #24,#25,#26 — a banner inside the thread, in that state's own words. */
  banner?: { title: string; body: string } | null;

  /* the composer — #28..#30 */
  input: string;
  onInput: (v: string) => void;
  onSend: () => void;
  composerPlaceholder: string;
  composerDisabled: boolean;
  showComposer: boolean;

  /* #27 the low-balance warning */
  lowBalance?: { text: string; action: string; onAction: () => void } | null;

  /* #31,#32 the hold — the pausing screen */
  hold?: {
    title: string; sub: string; body: string; costLine: string;
    graceSeconds?: number | null;
    onResume?: () => void; onAddTime: (amountGbp: number) => void; onEndNow: () => void;
    perMinute: number | null;
  } | null;

  /* #34 and every terminal state — the ended screen */
  receipt?: (HallReceipt & {
    title: string; sub: string;
    onAgain: () => void; onBack: () => void; onRate?: (stars: number) => void;
  }) | null;

  /* #33 anything with no hall home — drawn in the panel in its own words */
  notice?: { eyebrow: string; title: string; sub: string; legal?: string;
             action?: { label: string; onClick: () => void; pending?: boolean } } | null;

  /* #5,#8 header actions */
  onBack: () => void;
  /** Leaves /chats entirely. There was no way out of this route before. */
  onLeave?: () => void;
  onOpenProfile: () => void;
  onEnd?: () => void;
  statusWord: string;
}

export default function HallRoom(p: HallRoomProps) {
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    /* The entry hall disables this sheet as it unmounts, and she arrives here
       straight from it — without this the room renders completely unstyled. */
    setHallSheetEnabled(true);
    return () => { setHallSheetEnabled(false); };
  }, []);

  /* The sky and the runtime now belong to HallStage above. This component
     renders .room and drives the running instance; it no longer creates one. */
  const runtime = useContext(HallRuntimeContext);
  const hallInstance = runtime?.hall ?? null;

  /* Kept in a ref on every render so startHall's closures — which live in
     HallStage now — still read the latest props, exactly as before. */
  useEffect(() => {
    if (!runtime) return;
    runtime.handlers.current = {
      onAddTime: (a) => p.hold?.onAddTime(a),
      onEndNow: () => p.hold?.onEndNow(),
      onRate: (s) => p.receipt?.onRate?.(s),
      onAgain: () => p.receipt?.onAgain(),
      onBackToReaders: () => p.receipt?.onBack(),
    };
  });

  /* FIX A — startHall wired the receipt/hold controls when HallStage mounted,
     which on /chats is the LIST view: this room's DOM did not exist yet, every
     guarded getElementById skipped, and the closing card rendered with zero
     click listeners (CDP-measured). Re-wire against the real DOM now that the
     room is mounted. Idempotent — unbinds before it binds. */
  useEffect(() => { hallInstance?.wireRoom?.(); }, [hallInstance]);

  /* the caller's phase drives the hall's own state machine */
  useEffect(() => {
    const h = hallInstance; if (!h) return;
    if (p.phase === "pausing") h.pausing(p.hold?.graceSeconds ?? undefined);
    else if (p.phase === "ended") h.ended(p.receipt ?? undefined);
    else h.room();
  }, [hallInstance, p.phase, p.hold?.graceSeconds, p.receipt?.minutes, p.receipt?.total, p.receipt?.perMinute]);

  useEffect(() => { hallInstance?.setRate(p.hold?.perMinute ?? null); }, [hallInstance, p.hold?.perMinute]);

  /* keep the newest message in view, the way a chat should */
  useEffect(() => {
    const t = threadRef.current; if (t) t.scrollTop = t.scrollHeight;
  }, [p.messages.length, p.readerTyping]);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".orb .photo");
    if (el && p.readerPhoto) {
      el.style.backgroundImage = `url("${p.readerPhoto}"), ${getComputedStyle(el).backgroundImage}`;
      el.style.backgroundSize = "cover"; el.style.backgroundPosition = "center";
    }
  }, [p.readerPhoto]);

  const meter = p.isPaused ? "Paused" : formatMinutesLeft(p.minutesLeft);

  return (
    <>
      {/* The sky — #gl, #w1, #w2, #dust, #touch, .grain, .orbfix, .flash — and
          the startHall runtime now live in HallStage above this component, so a
          view with no room still gets the real sky. This renders .room only. */}

      {/* ══ the room ══ */}
      <div className="room">
        <header className="top">
          {/* #5 back, #5 profile, #6 status word, #8 end */}
          <button className="rbtn" id="roomback" aria-label="Back to your readings" onClick={p.onBack}>‹</button>
          <button className="who whobtn" aria-label="View your reader's profile" onClick={p.onOpenProfile}></button>
          <div className="whotext">
            <div className="nm">{p.readerName}</div>
            <div className="st" id="st">
              {p.isConnected ? p.statusWord : "Reconnecting…"}
            </div>
          </div>
          {/* DEFECT 2 — the money leads. Spent is the number she will dispute,
              so it is first and largest; elapsed and remaining follow. All three
              read what the session already reports — nothing is computed here. */}
          <div className="stats">
            <div className="stat spent"><b id="spent">{p.spentLabel ?? "£0.00"}</b><i>spent</i></div>
            <div className="stat"><b id="elapsed">{(p.elapsedLabel || "").replace(/\s*elapsed\s*$/, "") || "0:00"}</b><i>elapsed</i></div>
            <div className="stat"><b id="mins">{meter}</b><i>{p.isPaused ? "paused" : "left"}</i></div>
          </div>
          {p.onEnd && (
            <button className="rbtn rend" onClick={p.onEnd} aria-label="End the reading">End</button>
          )}
          {p.onLeave && (
            <button className="rbtn rleave" onClick={p.onLeave} aria-label="Leave for the readers">Readers</button>
          )}
        </header>

        <div className="threadwrap">
          <div className="thread" id="thread" ref={threadRef}>
            {/* #21 older messages */}
            {p.hasMore && p.messages.length > 0 && (
              <button className="older" onClick={p.onLoadMore} disabled={p.loadingMore}>
                {p.loadingMore ? "Loading…" : "Load older messages"}
              </button>
            )}
            {/* #18 loading, #20 empty */}
            {p.loadingMessages && <div className="rnote">Connecting…</div>}
            {!p.loadingMessages && p.messages.length === 0 && !p.banner && (
              <div className="rnote">No messages yet. Say anything — she is listening.</div>
            )}
            {p.messages.map((m) => (
              m.system
                ? <div key={m.id} className="rnote rsys">{m.text}</div>
                : <div key={m.id} className={"bub " + (m.mine ? "me" : "her")}>{m.text}</div>
            ))}
            {/* #23 */}
            {p.readerTyping && <div className="typing"><i></i><i></i><i></i></div>}
            {/* #24,#25,#26 — the banner keeps that state's own words */}
            {p.banner && (
              <div className="rbanner hbanner">
                <b>{p.banner.title}</b>
                <span>{p.banner.body}</span>
              </div>
            )}
          </div>
        </div>

        {/* #27 the low-balance warning */}
        {p.lowBalance && (
          <div className="lowbal">
            <span>{p.lowBalance.text}</span>
            <button id="lowbalact" type="button" onClick={p.lowBalance.onAction}>{p.lowBalance.action}</button>
          </div>
        )}

        {/* #28..#30 the composer */}
        {p.showComposer && (
          <form className="composer" onSubmit={(e) => { e.preventDefault(); p.onSend(); }}>
            <input
              className="box" id="roominput"
              value={p.input}
              onChange={(e) => p.onInput(e.target.value)}
              placeholder={p.composerPlaceholder}
              disabled={p.composerDisabled}
              aria-label="Your message"
            />
            <button className="send" id="send" type="submit" aria-label="send"
                    disabled={p.composerDisabled || !p.input.trim()}>↑</button>
          </form>
        )}

        {/* #33 and anything with no hall home — its own words, hall structure */}
        {p.notice && (
          <div className="rnotice">
            <p className="eyebrow">{p.notice.eyebrow}</p>
            <div className="ntitle">{p.notice.title}</div>
            <p className="psub">{p.notice.sub}</p>
            {p.notice.action && (
              <button className="begin" onClick={p.notice.action.onClick} disabled={p.notice.action.pending}>
                {p.notice.action.pending ? "…" : p.notice.action.label}
              </button>
            )}
            {p.notice.legal && <p className="legal">{p.notice.legal}</p>}
          </div>
        )}
      </div>

      {/* ══ 5 · the hold ══ */}
      <main className="stage stage2" id="pausestage">
        <section className="panel" id="pausepanel">
          <p className="eyebrow">{p.hold?.title ?? "Your minutes have run out"}</p>
          <h1 className="ptitle">{p.readerName} <em>is holding your place</em></h1>
          <p className="psub">{p.hold?.sub ?? "Nothing is lost. Everything you told her is still there, exactly where you left it."}</p>
          <div className="cd">
            <div className="cdnum" id="cdnum">5:00</div>
            <span className="slab">she can wait this long</span>
            <div className="cdbar"><i className="cdfill" id="cdfill"></i></div>
          </div>
          <div className="sound">
            <span className="slab">Add time</span>
            <div className="amts" id="amts">
              <button type="button" className="pill amt" data-amt="10" aria-pressed="false"><b>£10</b><i></i></button>
              <button type="button" className="pill amt" data-amt="25" aria-pressed="true"><span className="tag">most chosen</span><b>£25</b><i></i></button>
              <button type="button" className="pill amt" data-amt="50" aria-pressed="false"><b>£50</b><i></i></button>
            </div>
          </div>
          <button className="begin" id="addtime" type="button">Add £25 and carry on</button>
          {/* #31 keeps Resume, which only the paused (not grace) state offers */}
          {p.hold?.onResume && (
            <button className="quiet" id="resumeread" type="button" onClick={p.hold.onResume}>
              Resume the reading
            </button>
          )}
          <button className="quiet" id="endinstead" type="button">End the reading here instead</button>
          <p className="legal">{p.hold?.costLine ?? "You are charged for the minutes you use, nothing more."}</p>
        </section>
      </main>

      {/* ══ 6 · the receipt ══ */}
      <main className="stage stage2" id="endstage">
        <section className="panel" id="endpanel">
          <p className="eyebrow">{p.receipt?.title ?? "Your reading has ended"}</p>
          <h1 className="ptitle">{p.readerName} <em>will remember this</em></h1>
          <div className="receipt">
            <div className="rcell"><b className="rnum" id="rmins">—</b><span className="slab">duration</span></div>
            <div className="rcell"><b className="rnum" id="rtotal">—</b><span className="slab">total</span></div>
            <div className="rcell"><b className="rnum" id="rrate">—</b><span className="slab">per minute</span></div>
          </div>
          <div className="softbox">{p.receipt?.sub ?? "She keeps what you told her tonight. Next time you sit down with her, "}<strong>you start where you finished.</strong></div>
          <div className="sound">
            <span className="slab">How was she?</span>
            <div className="stars" id="stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className="star" data-star={n} aria-pressed="false"
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}>★</button>
              ))}
            </div>
          </div>
          <button className="begin" id="again" type="button">Read with her again</button>
          <button className="quiet" id="backtoreaders" type="button">Back to the readers</button>
          <p className="legal">Readings are for guidance and entertainment.</p>
        </section>
      </main>

    </>
  );
}

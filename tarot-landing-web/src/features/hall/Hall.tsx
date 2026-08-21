/* DESIGN-LOCKED-HALL.html moved into the app.
   Same elements, same nesting, same order, same ids and class names. No Tailwind.
   The stylesheet and the fragment shader are the source's own bytes, in
   src/styles/hall.css and ./hall.frag.glsl.

   Two modes:
     "preview" — /design-preview. The developer harness (mock bar, palette
                 swatches) and the room stage render, and the journey runs on
                 its own timers.
     "entry"   — the real customer flow. No harness, no room stage. The question
                 is submitted for real and the wait ends on the CHAT_ACCEPTED
                 websocket event, after which the existing global Incoming
                 Reading prompt takes over and carries her to /chats, exactly as
                 it does today. */

import { useEffect, useRef, useState } from "react";
import "../../styles/hall.css";
import "../../styles/hall-preview.css";
import "../../styles/hall-entry.css";
import { startHall } from "./startHall";
import { loadReader, submitRealRequest, applyReaderToDom, type Reader } from "./hallData";
import {
  holdIncoming, releaseIncoming, expectIncoming, clearExpectedIncoming,
} from "./incomingGate";
import { setHallSheetEnabled } from "./hallSheet";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getMyChatsWithDetails } from "@/features/chat/api/chatApi";
import HoldAmounts from "./HoldAmounts";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { NotificationType } from "@/features/notifications/types/notification.types";
// the same helper the reader's own page uses (browse/views/PsychicDetails.tsx:63),
// so the price in the hall and the price on her card can never disagree
import { formatPerMinuteGbp } from "@/lib/currency";

/* How long the arrival takes to play. hall.css:189 runs the `arr` animation for
   2700ms after an 800ms delay, so the sequence is finished at 3500ms; the
   design's own preview waits 3600ms before moving on (startHall.ts). The global
   prompt is released at the same 3600ms mark, so it appears the moment the
   arrival is over rather than on top of it. */
const ARRIVAL_MS = 3600;

/* The wait must not hang on one socket message. Chat 88 was accepted server-side
   in 21s while the notification socket had died 3s after the request; the
   customer would have sat on "preparing" forever. So while the request is
   outstanding the chat's status is also polled, and the socket coming back
   triggers an immediate re-check. A hit is fed through the notification
   context's own dispatch (emitLocal), so the arrival still runs through the
   exact handlers the socket message uses — one arrival path, not two. */
const ACCEPT_POLL_MS = 5000;
/* Stop polling here. Auto-accept always answers within its own 120s ceiling
   (TAROT-BACKEND/app/services/ai/reading_pre_session.py:34), so ten minutes is
   that many times over plus any plausible human accept; past it the customer
   has left this screen in practice, and the gate's own mount fallback
   (IncomingReadingModal.tsx:171) still catches the chat on the next page load. */
const ACCEPT_POLL_BOUND_MS = 10 * 60 * 1000;


export default function Hall({ mode = "preview", psychicId }:
  { mode?: "preview" | "entry"; psychicId?: number }) {
  const preview = mode === "preview";
  const hallRef = useRef<ReturnType<typeof startHall> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reader, setReader] = useState<Reader | null>(null);
  /* Set when the request lands, cleared on arrival or at the bound — the
     acceptance poller runs exactly while this holds a timestamp. */
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  /* Flipped by the CHAT_ACCEPTED handler itself — real or synthetic — so the
     poller can never dispatch a second arrival after the first. */
  const acceptedRef = useRef(false);
  const { user } = useAuth();
  const { onNotification, isConnected, emitLocal } = useNotifications();

  useEffect(() => {
    /* Marks which mode is on screen so the two companion sheets can scope
       themselves structurally instead of guessing from the markup. */
    document.documentElement.setAttribute("data-hall", mode);
    setHallSheetEnabled(true);
    const hall = startHall({
      mode,
      onBegin: preview ? undefined : async (question: string) => {
        setError(null);
        const r = await submitRealRequest(question);
        if (!r.ok) { setError(r.error); return false; }
        setWaitingSince(Date.now());
        // This session is now the requester: its own acceptance must carry her
        // straight in, not prompt her to accept a second time.
        if (psychicId) expectIncoming(psychicId);
        return true;
      },
    });
    hallRef.current = hall;

    /* The rate reaches the amount buttons the moment the reader lands, so
       "£25" can say how many minutes that actually buys with her. */
    const took = (r: Reader) => { applyReaderToDom(r); setReader(r); hall.setRate(r.pricePerMinute); };
    if (!preview && psychicId) {
      loadReader(psychicId).then(took).catch((e: Error) => setError(e.message));
    } else if (preview) {
      loadReader().then(took).catch(() => { /* preview keeps the mock face */ });
    }

    return () => {
      hall.stop();
      setHallSheetEnabled(false);
      document.documentElement.removeAttribute("data-hall");
      hallRef.current = null;
    };
  }, [mode, preview, psychicId]);

  /* The wait ends when the reader accepts — the same event the deleted request
     modal used, and the same one the global gate still listens for
     (features/chat/components/IncomingReadingModal.tsx:120), which is what
     actually carries her to /chats.

     That prompt is held for the length of the arrival so it cannot land on top
     of it, then released untouched. The hold is dropped on unmount too, so
     leaving this page early can never strand it. */
  useEffect(() => {
    if (preview) return;
    holdIncoming();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onNotification(NotificationType.CHAT_ACCEPTED, () => {
      acceptedRef.current = true;
      setWaitingSince(null); // the poller's job is done
      hallRef.current?.arrive();
      if (timer) clearTimeout(timer);
      timer = setTimeout(releaseIncoming, ARRIVAL_MS);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
      releaseIncoming();
      // Leaving the hall ends the requester claim: an acceptance that lands
      // while she is elsewhere on the site goes back to prompting her.
      clearExpectedIncoming();
    };
  }, [preview, onNotification]);

  /* The acceptance poller. Runs only between the request landing and the
     arrival; each tick asks /chat/my-chats (already coalesced + 2s-cached in
     chatApi.ts) whether this reader's chat has gone ACTIVE without a join. A
     hit becomes a synthetic CHAT_ACCEPTED through emitLocal, so the handler
     above and the global gate fire exactly as they do for the socket message.
     acceptedRef — set by that handler, synchronously, for real and synthetic
     events alike — is checked before dispatching, so the two paths can race
     and the customer still arrives once. */
  const pollTickRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (preview || waitingSince == null || !psychicId) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || acceptedRef.current) return;
      if (Date.now() - waitingSince > ACCEPT_POLL_BOUND_MS) {
        setWaitingSince(null);
        clearExpectedIncoming(); // past the bound, an acceptance prompts again
        return;
      }
      try {
        const chats = await getMyChatsWithDetails();
        if (stopped || acceptedRef.current) return;
        const mine = (chats || []).find(
          (c: any) =>
            (!user || c.user_id === user.id) &&
            c.psychic_id === psychicId &&
            c.status === "ACTIVE" &&
            !c.client_joined_at
        );
        if (mine) {
          emitLocal({
            type: "notification",
            notification_type: NotificationType.CHAT_ACCEPTED,
            title: "Reading accepted",
            message: `${mine.psychic_username || "Your psychic"} is ready to begin your reading.`,
            data: {
              chat_id: mine.id,
              psychic_id: mine.psychic_id,
              psychic_name: mine.psychic_username,
            },
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        /* transient failure — the next tick simply asks again */
      }
    };
    pollTickRef.current = tick;
    const id = setInterval(tick, ACCEPT_POLL_MS);
    tick(); // first check now, not an interval from now
    return () => {
      stopped = true;
      clearInterval(id);
      pollTickRef.current = () => {};
    };
  }, [preview, waitingSince, psychicId, user, emitLocal]);

  /* The socket coming back is the strongest moment to re-check: an accept
     while it was down is exactly what would have been missed. */
  const prevConnectedRef = useRef(isConnected);
  useEffect(() => {
    const was = prevConnectedRef.current;
    prevConnectedRef.current = isConnected;
    if (isConnected && !was) pollTickRef.current();
  }, [isConnected]);

  /* Her price, before she can press the button — never a hardcoded number. */
  const rate = reader?.pricePerMinute != null && reader.pricePerMinute > 0
    ? `${formatPerMinuteGbp(reader.pricePerMinute)} per minute`
    : null;

  return (
    <>
      <canvas id="gl"></canvas>
      <div className="wheel"><svg id="w1" viewBox="0 0 100 100"></svg></div>
      <div className="wheel2"><svg id="w2" viewBox="0 0 100 100"></svg></div>
      <canvas id="dust"></canvas>
      <div className="grain"></div>

      {/* the orb travels through every state */}
      <div className="orbfix"><div className="orb" id="orb">
        <div className="aura"></div><div className="halo2"></div><div className="halo"></div>
        <div className="photo"></div>
      </div></div>

      <div className="flash"></div>

      {/* 1 · the request */}
      <main className="stage">
        <section className="panel" id="panel">
          <p className="eyebrow">A new reading</p>
          <h1 className="ptitle">Valentina <em>is listening</em></h1>
          <p className="psub">Tell her what brought you here tonight. She reads from whatever you give her.</p>
          <textarea id="q" rows={3} placeholder="Whatever's sitting heaviest… names, birthdays, how long it's been going on."></textarea>
          <div className="sound">
            <span className="slab">What you'll hear</span>
            <div className="pills" id="pills">
              <button className="pill" data-snd="none" aria-pressed="true">Silence</button>
              <button className="pill" data-snd="rain" aria-pressed="false">Rain</button>
              <button className="pill" data-snd="bowls" aria-pressed="false">Singing bowls</button>
              <button className="pill" data-snd="hum" aria-pressed="false">Deep hum</button>
            </div>
          </div>
          <button className="begin" id="begin">Begin the reading</button>
          {/* Her rate, in the design's own label treatment. */}
          {rate && <p className="eyebrow rate" id="hall-rate">{rate}</p>}
          {/* A failure must be visible, never swallowed. Uses the design's own
              .legal type so no new styling is introduced. */}
          {error && <p className="legal" id="hall-error" role="alert">{error}</p>}
          <p className="legal">Readings are for guidance and entertainment.</p>
        </section>
      </main>

      {/* 2 · the wait */}
      <div className="lobby">
        <div className="lname">Valentina <em>has your words</em></div>
        <div className="lstat">Preparing your reading</div>
        <div className="cards" id="cards">
          <div className="card"><span className="cardtext">She is sitting with what you wrote. <strong>Nothing is being charged yet.</strong></span></div>
          <div className="card"><span className="cardtext"><strong>Your minutes do not start until you are in the room with her.</strong></span></div>
          <div className="card"><span className="cardtext">The cards are drawn for you and your dates. <strong>Nothing here is a template.</strong></span></div>
          <div className="card"><span className="cardtext">She remembers you between readings, so you never have to <strong>explain yourself twice.</strong></span></div>
          <div className="card"><span className="cardtext">This opens on its own the moment she is ready. <strong>You do not have to do anything.</strong></span></div>
        </div>
        <div className="lhint">reach in and move your hand through it</div>
      </div>

      {/* 3 · she arrives */}
      <div className="arrive"><div className="aname">Valentina</div><div className="ahere">is here</div></div>

      {/* 4 · the reading — /design-preview only. Under option A the real flow
          hands off to the existing /chats room at this point. */}
      {preview && (
        <div className="room">
          <header className="top">
            <div className="who"></div>
            <div className="whotext">
              <div className="nm">Valentina</div>
              <div className="st" id="st">reading for you</div>
            </div>
            {/* DEFECT 2 — spent leads, mirroring the live room. Stand-in
                numbers, like every figure on this harness. */}
            <div className="stats">
              <div className="stat spent"><b id="pvspent">£4.20</b><i>spent</i></div>
              <div className="stat"><b id="pvelapsed">12:04</b><i>elapsed</i></div>
              <div className="stat"><b id="mins">38 min</b><i>left</i></div>
            </div>
            {/* DEFECT 1 — the preview room had NO End control at all; the
                harness relied on the mock bar. Mirrors the live room's End and
                drives the same toEnded the mock bar uses. */}
            <button className="rbtn rend" id="pvend" aria-label="End the reading">End</button>
          </header>
          <div className="threadwrap"><div className="thread" id="thread"></div></div>
          <div className="nudge" id="nudge">the sky is yours while you wait</div>
          <div className="composer">
            <div className="box">Say anything…</div>
            <button className="send" id="send" aria-label="send">↑</button>
          </div>
        </div>
      )}

      {/* 5 · her minutes run out, and 6 · the receipt.
          /design-preview only for now. They are built and driveable, but the
          live reading room has NOT been moved onto them yet, so rendering them
          in the customer flow would put two unwired panels on the screen where
          money is charged. They go into the flow with that work, not before. */}
      {preview && (<>
      <main className="stage stage2" id="pausestage">
        <section className="panel" id="pausepanel">
          <p className="eyebrow">Your minutes have run out</p>
          <h1 className="ptitle">Valentina <em>is holding your place</em></h1>
          <p className="psub">Nothing is lost. Everything you told her is still there, exactly where you left it.</p>
          <div className="cd">
            <div className="cdnum" id="cdnum">5:00</div>
            <span className="slab">she can wait this long</span>
            <div className="cdbar"><i className="cdfill" id="cdfill"></i></div>
          </div>
          <div className="sound">
            <span className="slab">Add time</span>
            {/* the same one-source pills the live room renders */}
            <HoldAmounts />
          </div>
          <button className="begin" id="addtime">Add £50 and carry on</button>
          <button className="quiet" id="moreamts">A larger offering</button>
          <button className="quiet" id="endinstead">End the reading here instead</button>
          <p className="legal">You are charged for the minutes you use, nothing more.</p>
        </section>
      </main>

      {/* 6 · the reading ends */}
      <main className="stage stage2" id="endstage">
        <section className="panel" id="endpanel">
          <p className="eyebrow">Your reading has ended</p>
          <h1 className="ptitle">Valentina <em>will remember this</em></h1>
          <div className="receipt">
            <div className="rcell"><b className="rnum" id="rmins">—</b><span className="slab">minutes</span></div>
            <div className="rcell"><b className="rnum" id="rtotal">—</b><span className="slab">total</span></div>
            <div className="rcell"><b className="rnum" id="rrate">—</b><span className="slab">per minute</span></div>
          </div>
          <div className="softbox">She keeps what you told her tonight. Next time you sit down with her, <strong>you start where you finished.</strong></div>
          <div className="sound">
            <span className="slab">How was she?</span>
            <div className="stars" id="stars">
              <button className="star" data-star="1" aria-pressed="false" aria-label="1 star">★</button>
              <button className="star" data-star="2" aria-pressed="false" aria-label="2 stars">★</button>
              <button className="star" data-star="3" aria-pressed="false" aria-label="3 stars">★</button>
              <button className="star" data-star="4" aria-pressed="false" aria-label="4 stars">★</button>
              <button className="star" data-star="5" aria-pressed="false" aria-label="5 stars">★</button>
            </div>
          </div>
          <button className="begin" id="again">Read with her again</button>
          <button className="quiet" id="backtoreaders">Back to the readers</button>
          <p className="legal">Readings are for guidance and entertainment.</p>
        </section>
      </main>
      </>)}

      <canvas id="touch"></canvas>

      {/* the developer harness — /design-preview only */}
      {preview && <div className="swatches" id="swatches"></div>}

      {preview && (
        <div className="mockbar">
          <span>mockup only</span>
          <button id="sound" aria-pressed="false">sound: off</button>
          <button id="calm" aria-pressed="false">slower</button>
          <button id="cycle" aria-pressed="true">colour: drifting</button>
          <button id="preview" aria-pressed="false">watch the whole turn</button>
          <button id="send2">she replies</button>
          <button id="mkpause">credit runs out</button>
          <button id="mkend">reading ends</button>
          <button id="replay">replay from the start</button>
        </div>
      )}
    </>
  );
}

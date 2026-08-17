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
import { startHall } from "./startHall";
import { loadReader, submitRealRequest, applyReaderToDom } from "./hallData";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { NotificationType } from "@/features/notifications/types/notification.types";

/* hall.css carries global rules (html,body{overflow:hidden}, body background, a
   bare h1). Lazy loading keeps them out of the bundle until the Hall is opened,
   but once the chunk has loaded the sheet stays live for the rest of the session
   and would restyle every other page. So it is switched off on unmount. Nothing
   in the stylesheet itself is modified. */
function setHallSheetEnabled(on: boolean) {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = (sheet as CSSStyleSheet).cssRules; } catch { continue; }
    for (const r of Array.from(rules)) {
      if ((r as CSSStyleRule).selectorText === ".orbfix") {
        (sheet as CSSStyleSheet).disabled = !on;
        return;
      }
    }
  }
}

export default function Hall({ mode = "preview", psychicId }:
  { mode?: "preview" | "entry"; psychicId?: number }) {
  const preview = mode === "preview";
  const hallRef = useRef<ReturnType<typeof startHall> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { onNotification } = useNotifications();

  useEffect(() => {
    setHallSheetEnabled(true);
    const hall = startHall({
      mode,
      onBegin: preview ? undefined : async (question: string) => {
        setError(null);
        const r = await submitRealRequest(question);
        if (!r.ok) { setError(r.error); return false; }
        return true;
      },
    });
    hallRef.current = hall;

    if (!preview && psychicId) {
      loadReader(psychicId)
        .then(applyReaderToDom)
        .catch((e: Error) => setError(e.message));
    } else if (preview) {
      loadReader().then(applyReaderToDom).catch(() => { /* preview keeps the mock face */ });
    }

    return () => {
      hall.stop();
      setHallSheetEnabled(false);
      hallRef.current = null;
    };
  }, [mode, preview, psychicId]);

  /* The wait ends when the psychic accepts — the same event the deleted request
     modal used, and the same one the global gate still listens for
     (features/chat/components/IncomingReadingModal.tsx:120), which is what
     actually carries her to /chats. */
  useEffect(() => {
    if (preview) return;
    const off = onNotification(NotificationType.CHAT_ACCEPTED, () => {
      hallRef.current?.arrive();
    });
    return off;
  }, [preview, onNotification]);

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
          <div className="card">She is sitting with what you wrote. <strong>Nothing is being charged yet.</strong></div>
          <div className="card"><strong>Your minutes do not start until you are in the room with her.</strong></div>
          <div className="card">The cards are drawn for you and your dates. <strong>Nothing here is a template.</strong></div>
          <div className="card">She remembers you between readings, so you never have to <strong>explain yourself twice.</strong></div>
          <div className="card">This opens on its own the moment she is ready. <strong>You do not have to do anything.</strong></div>
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
            <div className="meter"><b id="mins">38 min</b><i>left</i></div>
          </header>
          <div className="threadwrap"><div className="thread" id="thread"></div></div>
          <div className="nudge" id="nudge">the sky is yours while you wait</div>
          <div className="composer">
            <div className="box">Say anything…</div>
            <button className="send" id="send" aria-label="send">↑</button>
          </div>
        </div>
      )}

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
          <button id="replay">replay from the start</button>
        </div>
      )}
    </>
  );
}

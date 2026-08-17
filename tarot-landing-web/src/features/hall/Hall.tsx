/* DESIGN-LOCKED-HALL.html moved into the app.
   Same elements, same nesting, same order, same ids and class names. No Tailwind.
   The stylesheet and the fragment shader are the source's own bytes, in
   src/styles/hall.css and ./hall.frag.glsl. */

import { useEffect } from "react";
import "../../styles/hall.css";
import { startHall } from "./startHall";
/* ADDED-BEGIN phase 3 — real reader name, photo and rate from the live API. */
import { wireRealData, submitRealRequest } from "./hallData";
/* ADDED-END */

export default function Hall() {
  useEffect(() => {
    const stop = startHall();
    /* ADDED-BEGIN phase 3 */
    wireRealData();
    const q = document.getElementById("q") as HTMLTextAreaElement | null;
    const begin = document.getElementById("begin");
    const onRealSubmit = () => { submitRealRequest(q ? q.value : ""); };
    begin?.addEventListener("click", onRealSubmit);
    /* ADDED-END */
    return () => {
      /* ADDED-BEGIN phase 3 */
      begin?.removeEventListener("click", onRealSubmit);
      /* ADDED-END */
      stop();
    };
  }, []);

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

      {/* 4 · the reading */}
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

      <canvas id="touch"></canvas>


      <div className="swatches" id="swatches"></div>

      <div className="mockbar">
        <span>mockup only</span>
        <button id="sound" aria-pressed="false">sound: off</button>
        <button id="calm" aria-pressed="false">slower</button>
        <button id="cycle" aria-pressed="true">colour: drifting</button>
        <button id="preview" aria-pressed="false">watch the whole turn</button>
        <button id="send2">she replies</button>
        <button id="replay">replay from the start</button>
      </div>
    </>
  );
}

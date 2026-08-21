/* HALLSTAGE — the hall runtime, owned above the room.

   Ownership only. This component renders exactly the sky markup HallRoom used
   to render itself, sets data-hall, and runs startHall. HallRoom now renders
   only .room and consumes the running instance through HallRuntimeContext.

   Nothing here starts a timer, opens a socket, sends a message or touches
   money. It is the same startHall call HallRoom made, moved up one level so a
   view without a room — the conversation list — still has the real sky.

   setHallSheetEnabled is deliberately NOT called here. It stays exactly where
   it was, in HallRoom, doing exactly what it did.

   Scoped to /chats: it is mounted by ClientChat and by nothing else, and it
   tears the whole runtime down on unmount so no hall state can reach another
   route. */
import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { startHall } from "./startHall";

/** The room's callbacks, held in a ref so startHall's closures always read the
    latest props — exactly as the original in-HallRoom closures did. */
export interface HallHandlers {
  onAddTime?: (amountGbp: number) => void;
  onEndNow?: () => void;
  onRate?: (stars: number) => void;
  onAgain?: () => void;
  onBackToReaders?: () => void;
}

export interface HallRuntime {
  /** null until the parent effect has started the hall. */
  hall: ReturnType<typeof startHall> | null;
  handlers: React.MutableRefObject<HallHandlers>;
}

export const HallRuntimeContext = createContext<HallRuntime | null>(null);

export default function HallStage({ children }: { children: ReactNode }) {
  const handlers = useRef<HallHandlers>({});
  const [hall, setHall] = useState<ReturnType<typeof startHall> | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-hall", "room");

    const h = startHall({
      mode: "room",
      onAddTime: (a) => handlers.current.onAddTime?.(a),
      onEndNow: () => handlers.current.onEndNow?.(),
      onRate: (s) => handlers.current.onRate?.(s),
      onAgain: () => handlers.current.onAgain?.(),
      onBackToReaders: () => handlers.current.onBackToReaders?.(),
    });
    setHall(h);

    /* ── TEARDOWN ──────────────────────────────────────────────────────────
       A hall runtime surviving onto another route is the 17 August failure
       class, so this unwinds all three things the hall owns:
         1. every timer, listener, audio node and attribute startHall added
            (its own cleanups also drop data-state, --panelTop and --gold),
         2. the nodes startHall drew INTO the sky markup — the rim circles,
            ticks and glyphs it appends to #w1 and #w2,
         3. the data-hall flag, which is what scopes every global rule in
            hall.css to this route.
       The sky hosts themselves (#gl, #dust, #touch, .grain, .orbfix, .flash)
       are React-owned and leave with this component. */
    return () => {
      h.stop();
      document.getElementById("w1")?.replaceChildren();
      document.getElementById("w2")?.replaceChildren();
      document.documentElement.removeAttribute("data-hall");
    };
    // startHall builds imperative DOM once and its callbacks read the latest
    // handlers through the ref above, so it must not be torn down per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <HallRuntimeContext.Provider value={{ hall, handlers }}>
      {/* ══ the sky — byte-for-byte the markup HallRoom rendered before ══ */}
      <canvas id="gl"></canvas>
      <div className="wheel"><svg id="w1" viewBox="0 0 100 100"></svg></div>
      <div className="wheel2"><svg id="w2" viewBox="0 0 100 100"></svg></div>
      <canvas id="dust"></canvas>
      <div className="grain"></div>
      <div className="orbfix"><div className="orb" id="orb">
        <div className="aura"></div><div className="halo2"></div><div className="halo"></div>
        <div className="photo"></div>
      </div></div>
      <div className="flash"></div>

      {children}

      <canvas id="touch"></canvas>
    </HallRuntimeContext.Provider>
  );
}

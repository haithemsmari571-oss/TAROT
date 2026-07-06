import { useEffect, useState } from "react";
import { usePageVisible } from "../../hooks/usePageVisible";

/**
 * Live countdown to a target time, ticking every second.
 *
 * Deliberately PLAIN and crisp — no per-digit animation. Tabular numerals keep
 * the width from shifting as the numbers change, so exactly one clean value is
 * ever shown (a reliable counter beats a fancy-but-broken one). Pauses and
 * resyncs when the tab is hidden.
 */
const pad2 = (n: number) => String(n).padStart(2, "0");

const LiveCountdown = ({ targetIso }: { targetIso: string }) => {
  const visible = usePageVisible();
  const target = new Date(targetIso).getTime();
  const calc = () => Math.max(Math.round((target - Date.now()) / 1000), 0);
  const [secs, setSecs] = useState(calc);

  useEffect(() => {
    if (!visible) return; // pause while hidden
    setSecs(calc()); // resync on regain / mount
    const id = window.setInterval(() => setSecs(calc()), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, target]);

  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const text =
    secs <= 0
      ? "any moment"
      : h > 0
      ? `${h}h ${pad2(m)}m ${pad2(s)}s`
      : `${m}m ${pad2(s)}s`;

  return (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        fontFeatureSettings: '"tnum" 1',
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
};

export default LiveCountdown;

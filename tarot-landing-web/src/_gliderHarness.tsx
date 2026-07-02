// TEMPORARY isolated preview harness for StardustGlider — not part of the app.
// Lets you see and drag the glider with no backend/login. Delete when done.
import { createRoot } from "react-dom/client";
import "./index.css";
import StardustGlider from "./features/payment/components/StardustGlider";

createRoot(document.getElementById("root")!).render(
  // Full-page canvas: the glider paints a fixed full-bleed tier scene behind
  // itself, so this wrapper just centres the floating glass card over it.
  <div
    style={{
      position: "relative",
      zIndex: 1,
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      boxSizing: "border-box",
    }}
  >
    <div style={{ width: "100%", maxWidth: 1000 }}>
      <StardustGlider
        fullBleed
        onPurchase={(amt) => alert(`(preview only) would start checkout for $${amt}`)}
      />
    </div>
  </div>,
);

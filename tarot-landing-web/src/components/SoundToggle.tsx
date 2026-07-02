import { useState } from "react";
import { primeNotificationSound } from "../lib/notificationSound";

// Small admin utility: unlocks the reading-request sound on a user click so it
// can play later (browsers block audio until the user has interacted with the
// page). Persists the choice in localStorage.
export function SoundToggle() {
  const [enabled, setSoundsEnabled] = useState(false);

  const enable = () => {
    // Prime the actual <audio> element within this user gesture so the chime
    // can autoplay later when a reading request arrives.
    primeNotificationSound();
    setSoundsEnabled(true);
    localStorage.setItem("adminSoundsEnabled", "true");
  };

  if (enabled || localStorage.getItem("adminSoundsEnabled") === "true") {
    return (
      <span
        style={{
          fontSize: "11px",
          color: "rgba(255,255,255,0.35)",
          userSelect: "none",
        }}
      >
        🔔 Sounds on
      </span>
    );
  }

  return (
    <button
      onClick={enable}
      style={{
        fontSize: "11px",
        background: "rgba(210,185,255,0.12)",
        border: "1px solid rgba(210,185,255,0.25)",
        color: "#D2B9FF",
        padding: "4px 10px",
        borderRadius: "6px",
        cursor: "pointer",
      }}
    >
      🔔 Enable sounds
    </button>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../theme";

const STORAGE_KEY = "av_welcome_credit_dismissed";

// One-time welcome-offer modal for NEW, logged-out visitors. Appears 4s after
// landing, once ever (persisted in localStorage), never again after dismiss, and
// never for logged-in users (the caller gates on !isAuthenticated). Matches the
// site's dark/gold style.
export default function WelcomePopup() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      /* localStorage unavailable — treat as not yet shown */
    }
    if (dismissed) return;
    const t = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  const claim = () => {
    dismiss();
    navigate("/register");
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />

      <div
        className="relative w-full max-w-sm rounded-3xl p-8 text-center"
        style={{
          backgroundColor: COLORS.surface,
          border: `1px solid ${COLORS.starGold}55`,
          boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 60px ${COLORS.starGold}22`,
        }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{
            backgroundColor: `${COLORS.starGold}1A`,
            border: `1px solid ${COLORS.starGold}44`,
          }}
        >
          <Icon icon="ph:gift-fill" className="text-3xl" style={{ color: COLORS.starGold }} />
        </div>

        <h2
          className="text-2xl font-black mb-2 leading-tight"
          style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }}
        >
          Welcome — your first reading is on us
        </h2>
        <p
          className="text-sm mb-6 font-bold"
          style={{ color: COLORS.starGold, fontFamily: TYPOGRAPHY.fontFamily.body }}
        >
          £15 free credit for new members
        </p>

        <button
          onClick={claim}
          className="w-full py-3.5 rounded-2xl font-black uppercase tracking-widest transition-transform hover:scale-105 mb-3"
          style={{
            backgroundColor: COLORS.starGold,
            color: COLORS.dark,
            fontFamily: TYPOGRAPHY.fontFamily.heading,
          }}
        >
          Claim My £15
        </button>
        <button
          onClick={dismiss}
          className="text-xs font-semibold text-white/40 hover:text-white/70 transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

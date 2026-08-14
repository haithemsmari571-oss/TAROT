import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import "../../../styles/glass.css";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useCelebrations } from "@/features/celebrations/CelebrationProvider";
import { constellationApi } from "../api/constellationApi";
import type { ConstellationData } from "../types/constellation.types";
import TodaysCard from "../components/TodaysCard";
import DailyRitual from "../components/DailyRitual";
import PracticeStreak from "../components/PracticeStreak";
import RitualsStrip from "../components/RitualsStrip";
import StardustBalance from "../components/StardustBalance";
import Phase2Placeholders from "../components/Phase2Placeholders";
import BrandedLoader from "../../../components/motion/BrandedLoader";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The Constellation â€” the client's daily home (Section 3). Mobile-first: a
 * single centered phone-width column; desktop simply centers it. Warm, calm,
 * ritual-not-casino tone. DOB is a mandatory signup field, so the birthdate
 * fallback here is only for a rare legacy account.
 */
const ClientProfile = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { celebrate } = useCelebrations();
  const [data, setData] = useState<ConstellationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const pullingRef = useRef(false); // hard guard against double-submit races

  useEffect(() => {
    load();
  }, []);

  // Keep every balance display in sync from one source: broadcast the total so
  // the navbar Stardust pill matches the balance card the moment it changes.
  const syncNavbar = (total: number) =>
    window.dispatchEvent(new CustomEvent("stardust:balance", { detail: total }));

  const load = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      setError(null);
      const fresh = await constellationApi.get();
      setData(fresh);
      syncNavbar(fresh.balance.total);
    } catch (err: any) {
      if (!quiet)
        setError(err?.response?.data?.message || "Couldn't load your Constellation.");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  // The whole reveal state machine lives here and is reconciled to the server.
  const reveal = async () => {
    if (pullingRef.current) return; // ignore rapid double taps
    pullingRef.current = true;
    setPulling(true);
    setRevealError(null);
    const started = Date.now();
    try {
      const result = await constellationApi.pull();
      // Keep the loader visible for at least 600ms so the wait reads as intentional.
      const elapsed = Date.now() - started;
      if (elapsed < 600) await wait(600 - elapsed);

      setData((prev) =>
        prev
          ? {
              ...prev,
              today: { ...prev.today, pulled: true, reward: result.reward, card: result.card },
              streak: result.streak,
              balance: result.balance,
            }
          : prev
      );
      syncNavbar(result.balance.total); // navbar pill updates with the card

      // Celebrate the pull reward via the global host, plus a day-7 streak bonus.
      celebrate({ kind: "pull", title: "Today's gift from the stars", amount: result.reward });
      if (result.bonus > 0) {
        celebrate({
          kind: "streak",
          title: "Seven days of practice âœ¨",
          amount: result.bonus,
          message: "Your devotion is seen.",
        });
      }
    } catch (err: any) {
      // Already pulled today (e.g. another tab/device, or a race): this is not an
      // error â€” reconcile to the server truth so the card shows face-up.
      if (err?.response?.status === 409) {
        await load();
      } else {
        setRevealError("Couldn't reveal your card. Please try again.");
      }
    } finally {
      pullingRef.current = false;
      setPulling(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="py-32 flex items-center justify-center">
          <BrandedLoader label="Reading the starsâ€¦" />
        </div>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell>
        <div className="py-32 flex flex-col items-center gap-4 text-center px-6">
          <Icon icon="solar:moon-stars-bold-duotone" className="text-5xl" style={{ color: "var(--gl-accent)" }} />
          <p className="text-base" style={{ color: "var(--gl-text)" }}>{error}</p>
          <button
            onClick={() => load()}
            className="rounded-2xl px-8 font-bold text-base"
            style={{ height: 52, backgroundColor: "var(--gl-accent)", color: "var(--gl-base)" }}
          >
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  // Rare legacy account with no DOB â†’ quiet inline fallback, not a blocking wall.
  if (!data.dob_set) {
    return (
      <Shell>
        <Header sign={null} />
        <BirthdateFallback onSaved={load} />
        <AccountFooter onLogout={() => { logout(); navigate("/login"); }} />
      </Shell>
    );
  }

  const card = data.today.card;

  return (
    <Shell>
      <Header sign={data.zodiac_sign} />

      <div className="space-y-6">
        {card && (
          <TodaysCard
            card={card}
            pulled={data.today.pulled}
            reward={data.today.reward}
            pulling={pulling}
            revealError={revealError}
            upsell={data.upsell}
            onReveal={reveal}
            onAskValentina={() => navigate("/psychics-browse")}
          />
        )}

        {card && <DailyRitual card={card} />}

        <PracticeStreak streak={data.streak} />

        <RitualsStrip rotation={data.rituals} onClaimed={() => load(true)} />

        <StardustBalance balance={data.balance} />

        <Phase2Placeholders />

        <AccountFooter onLogout={() => { logout(); navigate("/login"); }} />
      </div>
    </Shell>
  );
};

/* â”€â”€ Layout shell: cosmic background + centered phone-width column â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const Shell = ({ children }: { children: React.ReactNode }) => (
  <div
    className="relative min-h-screen w-full pt-24 pb-16"
    style={{ backgroundColor: "var(--gl-base)", fontFamily: "var(--gl-sans)" }}
  >
    <div
      className="fixed inset-0 pointer-events-none"
      style={{
        background: `radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--gl-accent) 7%, transparent) 0%, transparent 55%)`,
      }}
    />
    <div className="relative w-full max-w-md mx-auto px-4">{children}</div>
  </div>
);

const Header = ({ sign }: { sign: string | null }) => (
  <div className="mb-6 text-center">
    <h1
      className="tracking-tight"
      style={{ fontFamily: "var(--gl-serif)", fontWeight: 300, lineHeight: 1.05, letterSpacing: "-0.5px", fontSize: "clamp(1.9rem, 8vw, 2.5rem)", color: "var(--gl-text)" }}
    >
      Your <span style={{ color: "var(--gl-accent)" }}>Constellation</span>
    </h1>
    {sign && (
      <p className="mt-1 text-base" style={{ color: `color-mix(in srgb, var(--gl-text) 60%, transparent)` }}>
        {sign} Â· {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      </p>
    )}
  </div>
);

const AccountFooter = ({ onLogout }: { onLogout: () => void }) => (
  <div className="pt-4 flex justify-center">
    <button
      onClick={onLogout}
      className="text-base font-semibold flex items-center gap-2 px-6"
      style={{ height: 48, color: `color-mix(in srgb, var(--gl-text) 53%, transparent)` }}
    >
      <Icon icon="solar:logout-3-bold-duotone" className="text-lg" />
      Sign out
    </button>
  </div>
);

const BirthdateFallback = ({ onSaved }: { onSaved: () => void }) => {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!value) return;
    try {
      setSaving(true);
      setErr(null);
      await constellationApi.setBirthdate(value);
      onSaved();
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Couldn't save your date of birth.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="rounded-2xl p-6"
      style={{ backgroundColor: "var(--gl-glass)", border: `1px solid color-mix(in srgb, var(--gl-accent) 13%, transparent)` }}
    >
      <p className="text-lg font-bold mb-2" style={{ color: "var(--gl-text)" }}>
        Add your date of birth
      </p>
      <p className="text-base mb-4" style={{ color: `color-mix(in srgb, var(--gl-text) 67%, transparent)` }}>
        We use it to choose your daily card and reading. Just once.
      </p>
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-xl px-4 text-base mb-4"
        style={{
          height: 52,
          backgroundColor: "var(--gl-base)",
          color: "var(--gl-text)",
          border: `1px solid color-mix(in srgb, var(--gl-text) 13%, transparent)`,
        }}
      />
      {err && <p className="text-sm mb-3" style={{ color: "#c1443a" }}>{err}</p>}
      <button
        onClick={save}
        disabled={!value || saving}
        className="w-full rounded-2xl font-bold text-base disabled:opacity-60"
        style={{ height: 56, backgroundColor: "var(--gl-accent)", color: "var(--gl-base)" }}
      >
        {saving ? "Savingâ€¦" : "Save and continue"}
      </button>
    </section>
  );
};

export default ClientProfile;

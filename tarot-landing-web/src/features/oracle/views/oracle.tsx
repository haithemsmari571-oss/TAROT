import { useState, useEffect, useRef } from "react";
import { COLORS } from "../../../theme";
import { SIGNS } from "../data/Signs";
import { LIFE_PATH_MEANINGS } from "../data/LifePath";
import { oracleApi } from "../api/oracleApi";
import type { ZodiacSign as ApiZodiacSign } from "../api/oracleApi";

// ─── THEME ───────────────────────────────────────────────────────────────────


// ─── DATA ────────────────────────────────────────────────────────────────────

// Compatibility matrix: [love, communication, emotional, overall]
const COMPAT = {
  "Aries-Aries":        [85, 80, 70, 82], "Aries-Taurus":       [60, 55, 50, 58],
  "Aries-Gemini":       [88, 92, 75, 87], "Aries-Cancer":       [50, 45, 60, 52],
  "Aries-Leo":          [95, 88, 82, 92], "Aries-Virgo":        [45, 50, 40, 46],
  "Aries-Libra":        [78, 72, 65, 74], "Aries-Scorpio":      [72, 60, 68, 70],
  "Aries-Sagittarius":  [97, 90, 88, 95], "Aries-Capricorn":    [48, 52, 45, 49],
  "Aries-Aquarius":     [82, 88, 70, 83], "Aries-Pisces":       [65, 58, 72, 65],
  "Taurus-Taurus":      [90, 78, 88, 87], "Taurus-Gemini":      [55, 68, 48, 57],
  "Taurus-Cancer":      [92, 82, 95, 90], "Taurus-Leo":         [60, 55, 52, 58],
  "Taurus-Virgo":       [95, 88, 90, 93], "Taurus-Libra":       [72, 78, 68, 73],
  "Taurus-Scorpio":     [88, 72, 85, 85], "Taurus-Sagittarius": [45, 50, 42, 46],
  "Taurus-Capricorn":   [93, 85, 88, 91], "Taurus-Aquarius":    [40, 52, 38, 43],
  "Taurus-Pisces":      [88, 80, 92, 88], "Gemini-Gemini":      [82, 97, 65, 84],
  "Gemini-Cancer":      [55, 60, 62, 58], "Gemini-Leo":         [88, 92, 78, 88],
  "Gemini-Virgo":       [65, 72, 55, 65], "Gemini-Libra":       [92, 97, 82, 92],
  "Gemini-Scorpio":     [60, 55, 58, 59], "Gemini-Sagittarius": [85, 90, 75, 85],
  "Gemini-Capricorn":   [42, 50, 38, 44], "Gemini-Aquarius":    [95, 97, 85, 94],
  "Gemini-Pisces":      [58, 62, 65, 61], "Cancer-Cancer":      [95, 80, 98, 93],
  "Cancer-Leo":         [75, 68, 78, 74], "Cancer-Virgo":       [85, 82, 88, 85],
  "Cancer-Libra":       [55, 60, 58, 57], "Cancer-Scorpio":     [97, 82, 98, 95],
  "Cancer-Sagittarius": [45, 48, 50, 47], "Cancer-Capricorn":   [80, 72, 82, 79],
  "Cancer-Aquarius":    [42, 50, 45, 45], "Cancer-Pisces":      [98, 88, 97, 96],
  "Leo-Leo":            [88, 82, 75, 84], "Leo-Virgo":          [55, 62, 50, 56],
  "Leo-Libra":          [90, 88, 82, 88], "Leo-Scorpio":        [70, 62, 68, 68],
  "Leo-Sagittarius":    [95, 92, 88, 93], "Leo-Capricorn":      [52, 55, 48, 52],
  "Leo-Aquarius":       [75, 78, 68, 74], "Leo-Pisces":         [72, 68, 78, 72],
  "Virgo-Virgo":        [85, 90, 80, 85], "Virgo-Libra":        [60, 68, 55, 61],
  "Virgo-Scorpio":      [88, 80, 85, 86], "Virgo-Sagittarius":  [48, 55, 45, 49],
  "Virgo-Capricorn":    [93, 88, 90, 92], "Virgo-Aquarius":     [45, 58, 42, 47],
  "Virgo-Pisces":       [82, 75, 88, 82], "Libra-Libra":        [88, 92, 80, 88],
  "Libra-Scorpio":      [68, 62, 70, 67], "Libra-Sagittarius":  [85, 88, 78, 85],
  "Libra-Capricorn":    [58, 65, 52, 59], "Libra-Aquarius":     [92, 95, 85, 92],
  "Libra-Pisces":       [75, 72, 80, 75], "Scorpio-Scorpio":    [90, 72, 92, 87],
  "Scorpio-Sagittarius":[55, 52, 58, 55], "Scorpio-Capricorn":  [92, 82, 88, 89],
  "Scorpio-Aquarius":   [50, 55, 48, 51], "Scorpio-Pisces":     [97, 85, 97, 95],
  "Sagittarius-Sagittarius":[92, 90, 82, 90], "Sagittarius-Capricorn":[50, 55, 48, 51],
  "Sagittarius-Aquarius":[92, 95, 85, 92], "Sagittarius-Pisces":[72, 70, 75, 72],
  "Capricorn-Capricorn":[85, 82, 80, 83], "Capricorn-Aquarius": [48, 58, 45, 50],
  "Capricorn-Pisces":   [82, 75, 85, 81], "Aquarius-Aquarius":  [88, 97, 78, 89],
  "Aquarius-Pisces":    [62, 68, 70, 65], "Pisces-Pisces":      [92, 82, 97, 92],
};

const getCompat = (a, b) => {
  if (!a || !b) return null;
  if (a === b) return COMPAT[`${a}-${a}`] || [80, 80, 80, 80];
  const key1 = `${a}-${b}`;
  const key2 = `${b}-${a}`;
  return COMPAT[key1] || COMPAT[key2] || [60, 60, 60, 60];
};

const getCompatLabel = (score) => {
  if (score >= 90) return { label: "Cosmic Soulmates", color: "#D2B9FF" };
  if (score >= 80) return { label: "Stellar Bond", color: "#F2AE40" };
  if (score >= 70) return { label: "Strong Connection", color: "#51CF66" };
  if (score >= 60) return { label: "Promising Chemistry", color: "#74C0FC" };
  if (score >= 50) return { label: "Balanced Energies", color: "#FF922B" };
  return { label: "Growth Opportunity", color: "#FF6B6B" };
};

const dateToSign = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const m = d.getMonth() + 1, day = d.getDate();
  if ((m === 3 && day >= 21) || (m === 4 && day <= 19)) return "Aries";
  if ((m === 4 && day >= 20) || (m === 5 && day <= 20)) return "Taurus";
  if ((m === 5 && day >= 21) || (m === 6 && day <= 20)) return "Gemini";
  if ((m === 6 && day >= 21) || (m === 7 && day <= 22)) return "Cancer";
  if ((m === 7 && day >= 23) || (m === 8 && day <= 22)) return "Leo";
  if ((m === 8 && day >= 23) || (m === 9 && day <= 22)) return "Virgo";
  if ((m === 9 && day >= 23) || (m === 10 && day <= 22)) return "Libra";
  if ((m === 10 && day >= 23) || (m === 11 && day <= 21)) return "Scorpio";
  if ((m === 11 && day >= 22) || (m === 12 && day <= 21)) return "Sagittarius";
  if ((m === 12 && day >= 22) || (m === 1 && day <= 19)) return "Capricorn";
  if ((m === 1 && day >= 20) || (m === 2 && day <= 18)) return "Aquarius";
  return "Pisces";
};

const calcLifePath = (dateStr) => {
  if (!dateStr) return null;
  const digits = dateStr.replace(/-/g, "").split("").map(Number);
  let sum = digits.reduce((a, b) => a + b, 0);
  while (sum > 9 && sum !== 11 && sum !== 22 && sum !== 33) {
    sum = sum.toString().split("").map(Number).reduce((a, b) => a + b, 0);
  }
  return sum;
};

// ─── STYLES ──────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,400;12..96,600;12..96,700;12..96,800&family=Poppins:wght@300;400;500;600&display=swap');
  body { background: ${COLORS.dark}; color: ${COLORS.neutralWhite}; font-family: 'Poppins', sans-serif; overflow-x: hidden; }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: ${COLORS.dark}; } ::-webkit-scrollbar-thumb { background: ${COLORS.primaryDark}; border-radius: 2px; }
  input[type="date"] { color-scheme: dark; }
  @keyframes twinkle { 0%,100%{opacity:.2;transform:scale(1)} 50%{opacity:.9;transform:scale(1.6)} }
  @keyframes orbit { from{transform:rotate(0deg) translateX(60px) rotate(0deg)} to{transform:rotate(360deg) translateX(60px) rotate(-360deg)} }
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
  @keyframes pulse-ring { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(1.8);opacity:0} }
  @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
  @keyframes spin-slow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes fadeSlideUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  @keyframes scoreGrow { from{stroke-dashoffset:440} to{stroke-dashoffset:var(--offset)} }
  .star { position:absolute; border-radius:50%; background:white; animation:twinkle var(--dur,3s) infinite; animation-delay:var(--delay,0s); }
  .float { animation:float 4s ease-in-out infinite; }
  .shimmer-text { background: linear-gradient(90deg, ${COLORS.primary} 0%, ${COLORS.primaryLight} 30%, ${COLORS.starGold} 60%, ${COLORS.primary} 100%); background-size:200%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:shimmer 4s linear infinite; }
  .spin-slow { animation:spin-slow 40s linear infinite; }
  .fade-up { animation:fadeSlideUp .5s ease forwards; }
  .card-hover { transition:all .3s cubic-bezier(.34,1.56,.64,1); }
  .card-hover:hover { transform:translateY(-8px) scale(1.02); }
  .tab-btn { transition:all .2s ease; border:none; cursor:pointer; font-family:'Poppins',sans-serif; }
  .sign-pill { transition:all .25s ease; cursor:pointer; border:none; background:none; font-family:'Poppins',sans-serif; }
  .sign-pill:hover { transform:translateY(-4px); }
  .close-btn { background:none; border:none; cursor:pointer; transition:all .2s; }
  .close-btn:hover { transform:rotate(90deg); }
  input { font-family:'Poppins',sans-serif; }
  button { font-family:'Poppins',sans-serif; }
  .section { animation:fadeSlideUp .6s ease forwards; }
  .meter-bar { transition:width 1.2s cubic-bezier(.34,1.2,.64,1); }
  @media(max-width:768px){.hero-section{padding:40px 0 32px !important}.section-card{padding:24px 16px !important}.birthday-grid{grid-template-columns:1fr !important}.birthday-sep{display:none !important}.signs-grid-2col{grid-template-columns:1fr !important}.sign-card-grid{grid-template-columns:repeat(3,1fr) !important}.score-ring-grid{grid-template-columns:repeat(2,1fr) !important;gap:12px !important;padding:20px 12px !important}.lp-grid-2col{grid-template-columns:1fr !important}.modal-grid{grid-template-columns:1fr !important}.modal-compat-grid{grid-template-columns:1fr !important}.element-legend{flex-direction:column !important;align-items:center !important}.chart-cards{grid-template-columns:repeat(auto-fill,minmax(100px,1fr)) !important}}
  @media(max-width:480px){.sign-card-grid{grid-template-columns:repeat(2,1fr) !important}.chart-cards{grid-template-columns:repeat(2,1fr) !important}}
`;

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

const Stars = () => {
  const stars = Array.from({ length: 80 }, (_, i) => ({
    id: i, top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`,
    size: `${1 + Math.random() * 2}px`, dur: `${2 + Math.random() * 4}s`, delay: `${Math.random() * 5}s`,
  }));
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      {stars.map(s => (
        <div key={s.id} className="star" style={{ top: s.top, left: s.left, width: s.size, height: s.size, "--dur": s.dur, "--delay": s.delay }} />
      ))}
    </div>
  );
};

const ScoreRing = ({ score, label, color, size = 100 }) => {
  const r = 42, circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="50" cy="50" r={r} fill="none" stroke={COLORS.surfaceAccent} strokeWidth="8" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color || COLORS.primary} strokeWidth="8"
            strokeLinecap="round" strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.34,1.2,.64,1)", "--offset": offset }}
          />
        </svg>
        <div style={{ 
          position: "absolute", 
          top: "50%", 
          left: "50%", 
          transform: "translate(-50%, -50%)",
          fontFamily: "'Bricolage Grotesque'", 
          fontWeight: 800, 
          fontSize: size * 0.26, 
          color: color || COLORS.primary 
        }}>
          {score}%
        </div>
      </div>
      <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: COLORS.neutralGray, fontWeight: 600 }}>{label}</div>
    </div>
  );
};

const SignCard = ({ sign, selected, onClick }) => (
  <button onClick={onClick} className="sign-pill card-hover"
    style={{
      padding: "12px 8px", borderRadius: 20, background: selected ? `${COLORS.primary}18` : `${COLORS.surfaceAccent}80`,
      border: `1.5px solid ${selected ? COLORS.primary : `${COLORS.neutralDarkGray}80`}`,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      boxShadow: selected ? `0 0 24px ${COLORS.primary}30` : "none",
      minWidth: 72,
    }}>
    <span style={{ fontSize: 28, lineHeight: 1 }}>{sign.symbol}</span>
    <span style={{ fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: selected ? COLORS.primary : COLORS.neutralGray }}>{sign.name}</span>
  </button>
);

const MeterBar = ({ label, value, color }) => {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(value), 200); return () => clearTimeout(t); }, [value]);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: COLORS.neutralGray, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: color }}>{value}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: `${COLORS.surfaceAccent}`, overflow: "hidden" }}>
        <div className="meter-bar" style={{ height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${COLORS.primaryDark}, ${color})`, width: `${w}%` }} />
      </div>
    </div>
  );
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function oracle() {
  const [activeTab, setActiveTab] = useState("birthday"); // birthday | signs | chart | lifepath
  const [modal, setModal] = useState(null);
  const [apiSigns, setApiSigns] = useState<ApiZodiacSign[]>([]);
  const [loading, setLoading] = useState(false);

  // birthday tab state
  const [dob1, setDob1] = useState("");
  const [dob2, setDob2] = useState("");
  const [bdResult, setBdResult] = useState(null);

  // signs tab state
  const [manualSign1, setManualSign1] = useState<number | null>(null);
  const [manualSign2, setManualSign2] = useState<number | null>(null);
  const [manualResult, setManualResult] = useState(null);

  // lifepath
  const [lpDob, setLpDob] = useState("");
  const [lpResult, setLpResult] = useState(null);

  // Fetch zodiac signs on mount
  useEffect(() => {
    const fetchSigns = async () => {
      try {
        const signs = await oracleApi.getZodiacSigns();
        setApiSigns(signs);
      } catch (error) {
        console.error("Failed to fetch zodiac signs:", error);
      }
    };
    fetchSigns();
  }, []);

  // Convert YYYY-MM-DD to DD/MM/YYYY
  const convertDateFormat = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const calcBirthday = async () => {
    if (!dob1 || !dob2) return;
    setLoading(true);
    try {
      const result = await oracleApi.calculateBirthdayCompatibility(
        convertDateFormat(dob1),
        convertDateFormat(dob2)
      );
      
      // Map API result to component format
      setBdResult({
        sign1: { name: result.user_sign, ...SIGNS.find(s => s.name === result.user_sign) },
        sign2: { name: result.partner_sign, ...SIGNS.find(s => s.name === result.partner_sign) },
        scores: [
          result.love_percentage,
          result.communication_percentage,
          result.emotional_bond_percentage,
          result.overall_harmony_percentage
        ],
        elementalInsight: result.elemental_insight
      });
    } catch (error) {
      console.error("Failed to calculate birthday compatibility:", error);
      alert("Failed to calculate compatibility. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const calcManual = async () => {
    if (!manualSign1 || !manualSign2) return;
    setLoading(true);
    try {
      const result = await oracleApi.calculateSignCompatibility(manualSign1, manualSign2);
      
      setManualResult({
        sign1: { name: result.user_sign, ...SIGNS.find(s => s.name === result.user_sign) },
        sign2: { name: result.partner_sign, ...SIGNS.find(s => s.name === result.partner_sign) },
        scores: [
          result.love_percentage,
          result.communication_percentage,
          result.emotional_bond_percentage,
          result.overall_harmony_percentage
        ],
        elementalInsight: result.elemental_insight
      });
    } catch (error) {
      console.error("Failed to calculate sign compatibility:", error);
      alert("Failed to calculate compatibility. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const calcLP = async () => {
    if (!lpDob) return;
    setLoading(true);
    try {
      const result = await oracleApi.getLifePathReading(convertDateFormat(lpDob));
      setLpResult(result.life_path_number);
    } catch (error) {
      console.error("Failed to calculate life path:", error);
      alert("Failed to calculate life path. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const result = activeTab === "birthday" ? bdResult : manualResult;

  const tabs = [
    { id: "birthday", label: "Birthday Test", icon: "🎂" },
    { id: "signs",    label: "Pick Signs",    icon: "⭐" },
    { id: "chart",    label: "Full Chart",    icon: "🔮" },
    { id: "lifepath", label: "Life Path",     icon: "🔢" },
  ];

  return (
    <>
      <style>{css}</style>
      <Stars />

      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", maxWidth: 1100, margin: "0 auto", padding: "0 20px 80px" }}>

        {/* ── HERO ── */}
        <header className="hero-section" style={{ textAlign: "center", padding: "80px 0 60px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: `${COLORS.primary}15`, border: `1px solid ${COLORS.primary}40`, borderRadius: 999, padding: "6px 18px", marginBottom: 28 }}>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.25em", color: COLORS.primary }}>✦ Celestial Insight Engine</span>
          </div>
          <h1 style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: "clamp(2.8rem, 7vw, 5.5rem)", lineHeight: 1, letterSpacing: "-0.03em", marginBottom: 20 }}>
            <span className="shimmer-text uppercase">Cosmic</span><br />
            <span style={{ color: COLORS.neutralWhite }}>Compatibility</span>
          </h1>
          <p style={{ color: COLORS.neutralGray, fontSize: "1rem", maxWidth: 520, margin: "0 auto 16px", lineHeight: 1.7, fontWeight: 400 }}>
            Discover how the stars aligned at your birth — and what that means for love, communication, emotional bonds, and your soul's unique journey.
          </p>
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
            {["💖 Love Compatibility", "💬 Communication", "🌊 Emotional Bond", "🔢 Life Path Number"].map(f => (
              <span key={f} style={{ fontSize: "0.72rem", fontWeight: 600, color: COLORS.neutralGray, letterSpacing: "0.05em" }}>{f}</span>
            ))}
          </div>
        </header>

        {/* ── TABS ── */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 40 }}>
          {tabs.map(t => (
            <button key={t.id} className="tab-btn" onClick={() => setActiveTab(t.id)}
              style={{
                padding: "10px 22px", borderRadius: 999,
                background: activeTab === t.id ? COLORS.primary : `${COLORS.surfaceAccent}80`,
                color: activeTab === t.id ? COLORS.dark : COLORS.neutralGray,
                fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.1em",
                border: `1.5px solid ${activeTab === t.id ? COLORS.primary : `${COLORS.neutralDarkGray}60`}`,
                boxShadow: activeTab === t.id ? `0 4px 20px ${COLORS.primary}40` : "none",
              }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── BIRTHDAY TAB ── */}
        {activeTab === "birthday" && (
          <div className="section" key="bd">
            <div className="section-card" style={{ background: COLORS.surface, borderRadius: 32, border: `1px solid ${COLORS.neutralDarkGray}60`, padding: "40px 32px 48px", maxWidth: 720, margin: "0 auto" }}>
              <h2 style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: "1.6rem", color: COLORS.neutralWhite, marginBottom: 8, textAlign: "center" }}>Birthday Compatibility</h2>
              <p style={{ color: COLORS.neutralGray, textAlign: "center", fontSize: "0.85rem", marginBottom: 36 }}>Enter two birthdates to reveal your cosmic connection</p>
              
              <div className="birthday-grid" style={{ display: "grid", gridTemplateColumns: "1fr 40px 1fr", gap: 16, alignItems: "end", marginBottom: 28 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: COLORS.primary, marginBottom: 10 }}>Your Birthday</label>
                  <input type="date" value={dob1} onChange={e => { setDob1(e.target.value); setBdResult(null); }}
                    style={{ width: "100%", padding: "14px 16px", borderRadius: 14, background: COLORS.surfaceAccent, border: `1.5px solid ${COLORS.neutralDarkGray}`, color: COLORS.neutralWhite, fontSize: "0.9rem", outline: "none" }} />
                  {dob1 && <div style={{ marginTop: 8, fontSize: "0.72rem", color: COLORS.neutralGray, fontWeight: 600 }}>
                    {dateToSign(dob1) && `✦ ${dateToSign(dob1)} ${SIGNS.find(s => s.name === dateToSign(dob1))?.symbol}`}
                  </div>}
                </div>
                <div className="birthday-sep" style={{ textAlign: "center", paddingBottom: 14, fontSize: "1.4rem", color: COLORS.neutralDarkGray }}>♾</div>
                <div>
                  <label style={{ display: "block", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: COLORS.secondary, marginBottom: 10 }}>Their Birthday</label>
                  <input type="date" value={dob2} onChange={e => { setDob2(e.target.value); setBdResult(null); }}
                    style={{ width: "100%", padding: "14px 16px", borderRadius: 14, background: COLORS.surfaceAccent, border: `1.5px solid ${COLORS.neutralDarkGray}`, color: COLORS.neutralWhite, fontSize: "0.9rem", outline: "none" }} />
                  {dob2 && <div style={{ marginTop: 8, fontSize: "0.72rem", color: COLORS.neutralGray, fontWeight: 600 }}>
                    {dateToSign(dob2) && `✦ ${dateToSign(dob2)} ${SIGNS.find(s => s.name === dateToSign(dob2))?.symbol}`}
                  </div>}
                </div>
              </div>

              <button onClick={calcBirthday} disabled={!dob1 || !dob2 || loading}
                style={{ width: "100%", padding: "16px", borderRadius: 14, background: dob1 && dob2 && !loading ? `linear-gradient(135deg, ${COLORS.primaryDark}, ${COLORS.secondary})` : COLORS.surfaceAccent, border: "none", color: dob1 && dob2 ? "white" : COLORS.neutralGray, fontWeight: 800, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.2em", cursor: dob1 && dob2 && !loading ? "pointer" : "not-allowed", boxShadow: dob1 && dob2 ? `0 8px 32px ${COLORS.primaryDark}60` : "none", transition: "all .3s" }}>
                {loading ? "✦ Calculating..." : "✦ Reveal Cosmic Bond"}
              </button>
              
              {bdResult && <ResultPanel result={bdResult} onSignClick={setModal} />}
            </div>
          </div>
        )}

        {/* ── SIGNS TAB ── */}
        {activeTab === "signs" && (
          <div className="section" key="signs">
            <div className="section-card" style={{ background: COLORS.surface, borderRadius: 32, border: `1px solid ${COLORS.neutralDarkGray}60`, padding: "40px 32px 48px", maxWidth: 900, margin: "0 auto" }}>
              <h2 style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: "1.6rem", color: COLORS.neutralWhite, marginBottom: 8, textAlign: "center" }}>Choose Your Signs</h2>
              <p style={{ color: COLORS.neutralGray, textAlign: "center", fontSize: "0.85rem", marginBottom: 36 }}>Select two zodiac signs to explore their cosmic chemistry</p>
              
              <div className="signs-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 32 }}>
                <div>
                  <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: COLORS.primary, marginBottom: 16 }}>
                    Sign One {manualSign1 && apiSigns.length > 0 && `— ${apiSigns.find(s => s.id === manualSign1)?.name}`}
                  </div>
                  <div className="sign-card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {(apiSigns.length > 0 ? apiSigns : SIGNS).map(s => {
                      const signId = 'id' in s ? s.id : SIGNS.findIndex(sign => sign.name === s.name) + 1;
                      return <SignCard key={signId} sign={s} selected={manualSign1 === signId} onClick={() => { setManualSign1(signId); setManualResult(null); }} />;
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: COLORS.secondary, marginBottom: 16 }}>
                    Sign Two {manualSign2 && apiSigns.length > 0 && `— ${apiSigns.find(s => s.id === manualSign2)?.name}`}
                  </div>
                  <div className="sign-card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {(apiSigns.length > 0 ? apiSigns : SIGNS).map(s => {
                      const signId = 'id' in s ? s.id : SIGNS.findIndex(sign => sign.name === s.name) + 1;
                      return <SignCard key={signId} sign={s} selected={manualSign2 === signId} onClick={() => { setManualSign2(signId); setManualResult(null); }} />;
                    })}
                  </div>
                </div>
              </div>

              <button onClick={calcManual} disabled={!manualSign1 || !manualSign2 || loading}
                style={{ width: "100%", padding: "16px", borderRadius: 14, background: manualSign1 && manualSign2 && !loading ? `linear-gradient(135deg, ${COLORS.primaryDark}, ${COLORS.secondary})` : COLORS.surfaceAccent, border: "none", color: manualSign1 && manualSign2 ? "white" : COLORS.neutralGray, fontWeight: 800, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.2em", cursor: manualSign1 && manualSign2 && !loading ? "pointer" : "not-allowed", boxShadow: manualSign1 && manualSign2 ? `0 8px 32px ${COLORS.primaryDark}60` : "none", transition: "all .3s" }}>
                {loading ? "✦ Calculating..." : "✦ Reveal Cosmic Bond"}
              </button>
              
              {manualResult && <ResultPanel result={manualResult} onSignClick={setModal} />}
            </div>
          </div>
        )}

        {/* ── CHART TAB ── */}
        {activeTab === "chart" && (
          <div className="section" key="chart">
            <div className="section-card" style={{ background: COLORS.surface, borderRadius: 32, border: `1px solid ${COLORS.neutralDarkGray}60`, padding: "40px 32px 48px" }}>
              <h2 style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: "1.6rem", color: COLORS.neutralWhite, marginBottom: 8, textAlign: "center" }}>Astrology Compatibility Chart</h2>
              <p style={{ color: COLORS.neutralGray, textAlign: "center", fontSize: "0.85rem", marginBottom: 36 }}>Click any sign to explore its full cosmic profile & compatibility insights</p>
              
              <div className="chart-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 16 }}>
                {SIGNS.map((sign, i) => (
                  <button key={sign.name} className="card-hover" onClick={() => setModal(sign)}
                    style={{ padding: "24px 16px", borderRadius: 24, background: `${COLORS.surfaceAccent}80`, border: `1.5px solid ${COLORS.neutralDarkGray}50`, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, position: "relative", overflow: "hidden", animationDelay: `${i * 0.05}s` }}>
                    <div style={{ position: "absolute", bottom: -20, left: -20, width: 80, height: 80, borderRadius: "50%", background: sign.color, opacity: 0.08, filter: "blur(20px)" }} />
                    <span style={{ fontSize: 38, lineHeight: 1 }}>{sign.symbol}</span>
                    <div>
                      <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: "0.9rem", color: COLORS.neutralWhite, textAlign: "center" }}>{sign.name}</div>
                      <div style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.12em", color: sign.color, fontWeight: 600, textAlign: "center", marginTop: 2 }}>{sign.element} {sign.emoji}</div>
                      <div style={{ fontSize: "0.6rem", color: COLORS.neutralGray, textAlign: "center", marginTop: 4 }}>{sign.dates}</div>
                    </div>
                    <div style={{ fontSize: "0.6rem", color: COLORS.primary, fontWeight: 600, textAlign: "center", marginTop: 2 }}>{sign.planet}</div>
                  </button>
                ))}
              </div>

              {/* Element group legend */}
              <div className="element-legend" style={{ marginTop: 40, display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
                {[["Fire", "#FF6B6B", "🔥"], ["Earth", "#51CF66", "🌿"], ["Air", "#74C0FC", "💨"], ["Water", "#9775FA", "🌊"]].map(([el, col, em]) => (
                  <div key={el} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: col }} />
                    <span style={{ fontSize: "0.75rem", color: COLORS.neutralGray, fontWeight: 600 }}>{em} {el}</span>
                    <span style={{ fontSize: "0.65rem", color: COLORS.neutralDarkGray, fontWeight: 500 }}>
                      {el === "Fire" ? "Aries Leo Sagittarius" : el === "Earth" ? "Taurus Virgo Capricorn" : el === "Air" ? "Gemini Libra Aquarius" : "Cancer Scorpio Pisces"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── LIFE PATH TAB ── */}
        {activeTab === "lifepath" && (
          <div className="section" key="lp">
            <div className="section-card" style={{ background: COLORS.surface, borderRadius: 32, border: `1px solid ${COLORS.neutralDarkGray}60`, padding: "40px 32px 56px", maxWidth: 860, margin: "0 auto" }}>
              <h2 style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: "1.6rem", color: COLORS.neutralWhite, marginBottom: 8, textAlign: "center" }}>Life Path Number Calculator</h2>
              <p style={{ color: COLORS.neutralGray, textAlign: "center", fontSize: "0.85rem", marginBottom: 40, maxWidth: 480, margin: "0 auto 40px" }}>
                Your Life Path Number is the most significant number in your numerology chart — calculated from your full date of birth, it reveals your core personality and soul's mission.
              </p>

              <div style={{ maxWidth: 420, margin: "0 auto 40px" }}>
                <label style={{ display: "block", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: COLORS.primary, marginBottom: 12 }}>Your Date of Birth</label>
                <div style={{ display: "flex", gap: 12 }}>
                  <input type="date" value={lpDob} onChange={e => { setLpDob(e.target.value); setLpResult(null); }}
                    style={{ flex: 1, padding: "14px 16px", borderRadius: 14, background: COLORS.surfaceAccent, border: `1.5px solid ${COLORS.neutralDarkGray}`, color: COLORS.neutralWhite, fontSize: "0.9rem", outline: "none" }} />
                  <button onClick={calcLP} disabled={!lpDob || loading}
                    style={{ padding: "14px 24px", borderRadius: 14, background: lpDob && !loading ? `linear-gradient(135deg, ${COLORS.primaryDark}, ${COLORS.secondary})` : COLORS.surfaceAccent, border: "none", color: lpDob ? "white" : COLORS.neutralGray, fontWeight: 800, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.15em", cursor: lpDob && !loading ? "pointer" : "not-allowed", whiteSpace: "nowrap", transition: "all .3s" }}>
                    {loading ? "..." : "Calculate"}
                  </button>
                </div>
              </div>

              {lpResult && <LifePathResult number={lpResult} />}

              {!lpResult && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginTop: 16 }}>
                  {[1,2,3,4,5,6,7,8,9,11,22,33].map(n => {
                    const info = LIFE_PATH_MEANINGS[n];
                    return (
                      <div key={n} style={{ padding: "18px 16px", borderRadius: 18, background: `${COLORS.surfaceAccent}60`, border: `1px solid ${COLORS.neutralDarkGray}40`, cursor: "pointer" }}
                        onClick={() => setLpResult(n)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: "1.6rem", color: COLORS.primary }}>{n}</span>
                          {[11,22,33].includes(n) && <span style={{ fontSize: "0.55rem", fontWeight: 700, background: `${COLORS.starGold}30`, color: COLORS.starGold, padding: "2px 6px", borderRadius: 999, letterSpacing: "0.08em" }}>MASTER</span>}
                        </div>
                        <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: "0.8rem", color: COLORS.neutralWhite, marginBottom: 4 }}>{info.title}</div>
                        <div style={{ fontSize: "0.62rem", color: COLORS.neutralGray, lineHeight: 1.5 }}>{info.desc.substring(0, 60)}…</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── SIGN MODAL ── */}
      {modal && <SignModal sign={modal} onClose={() => setModal(null)} />}
    </>
  );
}

// ─── RESULT PANEL ─────────────────────────────────────────────────────────────
function ResultPanel({ result, onSignClick }) {
  const { sign1, sign2, scores, elementalInsight } = result;
  const overall = scores[3];
  const { label, color } = getCompatLabel(overall);

  const elemCompat = () => {
    // Use API elemental insight if available, otherwise fallback to local calculation
    if (elementalInsight) return elementalInsight;
    
    const e1 = sign1.element, e2 = sign2.element;
    if (e1 === e2) return "Same-element pairing — deeply intuitive and naturally harmonious. You speak the same cosmic language.";
    const pairs = { "Fire-Air": "Fire and Air ignite each other — this duo thrives on stimulation, creativity, and shared enthusiasm.", "Air-Fire": "Fire and Air ignite each other — this duo thrives on stimulation, creativity, and shared enthusiasm.", "Earth-Water": "Earth and Water nourish one another — stability meets depth, creating a grounded and emotionally fulfilling bond.", "Water-Earth": "Earth and Water nourish one another — stability meets depth, creating a grounded and emotionally fulfilling bond.", "Fire-Earth": "Fire's passion meets Earth's grounding — with effort, you balance each other beautifully.", "Earth-Fire": "Fire's passion meets Earth's grounding — with effort, you balance each other beautifully.", "Air-Water": "Air and Water can be turbulent — head and heart often clash, but the growth potential is immense.", "Water-Air": "Air and Water can be turbulent — head and heart often clash, but the growth potential is immense." };
    return pairs[`${e1}-${e2}`] || "A unique elemental meeting with much to learn from each other.";
  };

  return (
    <div style={{ marginTop: 40, animationName: "fadeSlideUp", animationDuration: "0.5s", animationFillMode: "forwards" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
        <button onClick={() => onSignClick(sign1)} style={{ textAlign: "center", cursor: "pointer", background: "none", border: "none" }}>
          <div style={{ fontSize: 52 }}>{sign1.symbol}</div>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: "1rem", color: COLORS.primary, marginTop: 6 }}>{sign1.name}</div>
          <div style={{ fontSize: "0.65rem", color: COLORS.neutralGray, marginTop: 2 }}>{sign1.element} {sign1.emoji}</div>
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: "clamp(2.5rem,8vw,4rem)", color, lineHeight: 1 }}>{overall}%</div>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color, marginTop: 6 }}>{label}</div>
        </div>
        <button onClick={() => onSignClick(sign2)} style={{ textAlign: "center", cursor: "pointer", background: "none", border: "none" }}>
          <div style={{ fontSize: 52 }}>{sign2.symbol}</div>
          <div style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: "1rem", color: COLORS.secondary, marginTop: 6 }}>{sign2.name}</div>
          <div style={{ fontSize: "0.65rem", color: COLORS.neutralGray, marginTop: 2 }}>{sign2.element} {sign2.emoji}</div>
        </button>
      </div>

      {/* Score Rings */}
      <div className="score-ring-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32, background: COLORS.surfaceAccent, borderRadius: 20, padding: "28px 16px" }}>
        <ScoreRing score={scores[0]} label="Love" color="#FF6B6B" size={90} />
        <ScoreRing score={scores[1]} label="Comm." color="#74C0FC" size={90} />
        <ScoreRing score={scores[2]} label="Emotional" color="#9775FA" size={90} />
        <ScoreRing score={scores[3]} label="Overall" color={color} size={90} />
      </div>

      {/* Meter bars */}
      <div style={{ marginBottom: 28 }}>
        <MeterBar label="💖 Love & Romance" value={scores[0]} color="#FF6B6B" />
        <MeterBar label="💬 Communication" value={scores[1]} color="#74C0FC" />
        <MeterBar label="🌊 Emotional Bond" value={scores[2]} color="#9775FA" />
        <MeterBar label="⚡ Overall Harmony" value={scores[3]} color={color} />
      </div>

      {/* Elemental insight */}
      <div style={{ background: `${COLORS.primary}10`, border: `1px solid ${COLORS.primary}25`, borderRadius: 16, padding: "20px 24px" }}>
        <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: COLORS.primary, marginBottom: 10 }}>✦ Elemental Insight</div>
        <p style={{ fontSize: "0.85rem", color: COLORS.neutralGray, lineHeight: 1.7 }}>{elemCompat()}</p>
      </div>
    </div>
  );
}

// ─── LIFE PATH RESULT ─────────────────────────────────────────────────────────
function LifePathResult({ number }) {
  const info = LIFE_PATH_MEANINGS[number];
  if (!info) return null;
  const isMaster = [11, 22, 33].includes(number);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", animationName: "fadeSlideUp", animationDuration: "0.5s", animationFillMode: "forwards" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 40 }}>
        <div style={{ position: "relative", width: 160, height: 160, marginBottom: 20 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${COLORS.primary}20`, animation: "pulse-ring 2s ease-out infinite" }} />
          <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: `linear-gradient(135deg, ${COLORS.primaryDark}60, ${COLORS.secondary}40)`, border: `3px solid ${COLORS.primary}60`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 60px ${COLORS.primary}25` }}>
            <span style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: "4rem", color: COLORS.primary }}>{number}</span>
          </div>
        </div>
        {isMaster && <span style={{ fontSize: "0.65rem", fontWeight: 700, background: `${COLORS.starGold}20`, color: COLORS.starGold, padding: "4px 14px", borderRadius: 999, letterSpacing: "0.2em", marginBottom: 12 }}>✦ MASTER NUMBER</span>}
        <h3 style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: "2rem", color: COLORS.neutralWhite, marginBottom: 12, textAlign: "center" }}>{info.title}</h3>
        <p style={{ fontSize: "0.9rem", color: COLORS.neutralGray, lineHeight: 1.8, textAlign: "center", maxWidth: 520 }}>{info.desc}</p>
      </div>

      <div className="lp-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: `${COLORS.surfaceAccent}80`, borderRadius: 20, padding: "24px" }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "#51CF66", marginBottom: 16 }}>✦ Core Strengths</div>
          {info.strengths.map(s => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#51CF66", flexShrink: 0 }} />
              <span style={{ fontSize: "0.82rem", color: COLORS.neutralWhite, fontWeight: 500 }}>{s}</span>
            </div>
          ))}
        </div>
        <div style={{ background: `${COLORS.surfaceAccent}80`, borderRadius: 20, padding: "24px" }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "#FF6B6B", marginBottom: 16 }}>✦ Growth Areas</div>
          {info.challenges.map(s => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#FF6B6B", flexShrink: 0 }} />
              <span style={{ fontSize: "0.82rem", color: COLORS.neutralWhite, fontWeight: 500 }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24, background: `${COLORS.starGold}08`, border: `1px solid ${COLORS.starGold}25`, borderRadius: 16, padding: "20px 24px", textAlign: "center" }}>
        <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: COLORS.starGold, marginBottom: 8 }}>✦ Compatible Life Path Numbers</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          {getCompatibleLP(number).map(n => (
            <span key={n} style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: "1.1rem", color: COLORS.primary, background: `${COLORS.primary}15`, padding: "6px 14px", borderRadius: 999 }}>{n}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

const getCompatibleLP = (n) => {
  const map = { 1:[1,5,7], 2:[2,4,6,8], 3:[3,6,9], 4:[2,4,8], 5:[1,3,5,7], 6:[2,3,6,9], 7:[1,5,7], 8:[2,4,8], 9:[3,6,9], 11:[2,11,22], 22:[4,11,22], 33:[6,11,33] };
  return map[n] || [1,2,3];
};

// ─── SIGN MODAL ───────────────────────────────────────────────────────────────
function SignModal({ sign, onClose }) {
  const compatAll = SIGNS.map(s => {
    const sc = getCompat(sign.name, s.name);
    return { sign: s, overall: sc ? sc[3] : 0 };
  }).sort((a, b) => b.overall - a.overall);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: COLORS.surface, borderRadius: 32, border: `1px solid ${COLORS.neutralDarkGray}`, maxWidth: 720, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "48px 40px", position: "relative", animationName: "fadeSlideUp", animationDuration: "0.3s", animationFillMode: "forwards" }}>
        <button onClick={onClose} className="close-btn" style={{ position: "absolute", top: 20, right: 20, color: COLORS.neutralGray, fontSize: "1.3rem" }}>✕</button>

        <div className="modal-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr", gap: 40, alignItems: "start" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 80, marginBottom: 12 }}>{sign.symbol}</div>
            <h3 style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: "2rem", color: COLORS.neutralWhite, marginBottom: 6 }}>{sign.name}</h3>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: sign.color, marginBottom: 20 }}>{sign.element} {sign.emoji} · {sign.modality}</div>
            <div style={{ fontSize: "0.75rem", color: COLORS.neutralGray, marginBottom: 20 }}>{sign.dates}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[["Planet", sign.planet, "🪐"], ["Modality", sign.modality, "⚡"], ["Core Trait", sign.trait.split(" ")[0], "✨"]].map(([l, v, i]) => (
                <div key={l} style={{ background: COLORS.surfaceAccent, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: "1rem" }}>{i}</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.12em", color: COLORS.neutralGray, fontWeight: 600 }}>{l}</div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: COLORS.neutralWhite }}>{v}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: COLORS.primary, marginBottom: 8 }}>✦ Signature Trait</div>
            <p style={{ fontSize: "0.88rem", color: COLORS.neutralGray, lineHeight: 1.7, marginBottom: 28, fontStyle: "italic" }}>
              "{sign.trait} by nature, {sign.name} brings {sign.element.toLowerCase()} energy to every connection — ruled by {sign.planet}, their cosmic fingerprint is unmistakable."
            </p>
            <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: COLORS.primary, marginBottom: 16 }}>✦ Best Compatibility</div>
            <div className="modal-compat-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {compatAll.slice(0, 6).map(({ sign: s, overall }) => (
                <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: COLORS.surfaceAccent }}>
                  <span style={{ fontSize: "1.3rem" }}>{s.symbol}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: COLORS.neutralWhite }}>{s.name}</div>
                    <div style={{ fontSize: "0.6rem", color: overall >= 85 ? COLORS.primary : COLORS.neutralGray, fontWeight: 600 }}>{overall}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
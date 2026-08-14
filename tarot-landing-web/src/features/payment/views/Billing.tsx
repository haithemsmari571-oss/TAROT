import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { useSearchParams, useNavigate } from "react-router-dom";
import "../../../styles/glass.css";
import { usePayment } from "../hooks/usePayment";
import StardustGlider from "../components/StardustGlider";
import PageBackground from "../../../components/PageBackground";
import celestialPortal from "../../../assets/backgrounds/celestial-portal.webp";
import {
  TransactionStatus,
  TransactionType,
  type Transaction,
} from "../../ledger/types/transaction.types";

// ─── Constellation data for background patterns ──────────────────────────────
const CONSTELLATION_DATA = [
  {
    name: "Ursa Major",
    path: "M10,40 L30,35 L45,45 L60,45 L75,30 L90,35 L75,60 L60,45",
    stars: [
      [10, 40],
      [30, 35],
      [45, 45],
      [60, 45],
      [75, 30],
      [90, 35],
      [75, 60],
    ] as [number, number][],
  },
  {
    name: "Orion",
    path: "M20,10 L50,30 L80,10 M50,30 L45,50 L55,50 M45,50 L20,90 M55,50 L80,90",
    stars: [
      [20, 10],
      [50, 30],
      [80, 10],
      [45, 50],
      [55, 50],
      [20, 90],
      [80, 90],
    ] as [number, number][],
  },
  {
    name: "Cassiopeia",
    path: "M10,20 L30,50 L50,30 L70,60 L90,40",
    stars: [
      [10, 20],
      [30, 50],
      [50, 30],
      [70, 60],
      [90, 40],
    ] as [number, number][],
  },
];

// ─── Helper: transaction type display config ──────────────────────────────────
const getTypeDisplay = (type: TransactionType) => {
  switch (type) {
    case TransactionType.CREDIT:
      return {
        icon: "solar:arrow-down-bold-duotone",
        color: "#4ADE80",
        label: "Credit",
      };
    case TransactionType.DEBIT:
      return {
        icon: "solar:arrow-up-bold-duotone",
        color: "#F87171",
        label: "Debit",
      };
    case TransactionType.BONUS:
      return {
        icon: "solar:gift-bold-duotone",
        color: "#F2AE40",
        label: "Welcome credit",
      };
    case TransactionType.GIFT:
      return {
        icon: "solar:gift-bold-duotone",
        color: "#F2AE40",
        label: "Gift",
      };
    case TransactionType.REFUND:
      return {
        icon: "solar:arrow-down-bold-duotone",
        color: "#4ADE80",
        label: "Refund",
      };
    default:
      return {
        icon: "solar:transfer-horizontal-bold-duotone",
        color: "#94A3B8",
        label: "Transfer",
      };
  }
};

// ─── Helper: transaction status display config ────────────────────────────────
const getStatusDisplay = (status: TransactionStatus) => {
  switch (status) {
    case TransactionStatus.COMPLETED:
      return { color: "#4ADE80", label: "Completed" };
    case TransactionStatus.PENDING:
      return { color: "#FBBF24", label: "Pending" };
    case TransactionStatus.FAILED:
      return { color: "#F87171", label: "Failed" };
    case TransactionStatus.REVERSED:
      return { color: "#94A3B8", label: "Reversed" };
    default:
      return { color: "#94A3B8", label: status };
  }
};

// ─── Helper: format date ──────────────────────────────────────────────────────
const formatDate = (dateStr: string) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
};

// ─── Component ────────────────────────────────────────────────────────────────
const Billing = () => {
  const {
    loading: paymentLoading,
    error: paymentError,
    transactions: transactionsData,
    balance,
    createStardustCheckoutSession,
    fetchMyTransactions,
    fetchMyBalance,
  } = usePayment();

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);

  // Canvas & refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [windowSize, setWindowSize] = useState({ width: 1920, height: 1080 });

  // ─── Stable constellation data (no random on re-render) ────────────────────
  const constellations = Array.from({ length: 6 }).map((_, i) => {
    const data = CONSTELLATION_DATA[i % CONSTELLATION_DATA.length];
    return {
      ...data,
      x: (i * 17 + 5) % 90,
      y: (i * 23 + 10) % 90,
      scale: 0.6 + ((i * 0.15) % 0.8),
      rotate: (i * 60) % 360,
      opacity: 0.05 + ((i * 0.025) % 0.15),
    };
  });

  // ─── Responsive canvas sizing ───────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setWindowSize({ width: w, height: window.innerHeight });
      if (canvasRef.current) {
        canvasRef.current.width = w;
        canvasRef.current.height = window.innerHeight;
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ─── Animated star field ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    const stars = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1.5,
      opacity: Math.random(),
      pulse: 0.008 + Math.random() * 0.015,
    }));

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach((s) => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.opacity})`;
        ctx.fill();
        s.opacity += s.pulse;
        if (s.opacity > 0.8 || s.opacity < 0.2) s.pulse *= -1;
      });
      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [windowSize]);

  // ─── URL status flags ───────────────────────────────────────────────────────
  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "success") {
      setShowSuccessModal(true);
      fetchMyBalance();
      fetchMyTransactions({ page: 1, limit: 10 });
    } else if (status === "error") {
      setShowErrorModal(true);
    }
  }, [searchParams]);

  // ─── Initial data fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    fetchMyBalance();
    fetchMyTransactions({ page: currentPage, limit: 10 });
  }, [currentPage]);

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    navigate(window.location.pathname, { replace: true });
  };

  const closeErrorModal = () => {
    setShowErrorModal(false);
    navigate(window.location.pathname, { replace: true });
  };

  // ─── Custom-amount ("glider") purchase ─────────────────────────────────────
  const handleStardustPurchase = async (amountUsd: number) => {
    try {
      const returnUrl = searchParams.get("return_url");
      await createStardustCheckoutSession({
        amount_usd: amountUsd,
        return_url: returnUrl || undefined,
      });
    } catch (err) {
      console.error("Failed to create checkout session:", err);
      setShowErrorModal(true);
    }
  };

  // ─── Derived state ───────────────────────────────────────────────────────────
  const transactions = transactionsData?.transactions || [];

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative min-h-screen overflow-hidden px-4 pb-10 pt-8 sm:px-6 md:px-10 md:pt-10"
      style={{
        // Transparent so the fixed PageBackground below shows through (the dark
        // base is painted by PublicLayout). An opaque color here occludes it.
        backgroundColor: "transparent",
        fontFamily: "var(--gl-sans)",
      }}
    >
      {/* Immersive celestial backdrop — identical to the home/Sanctuary page. */}
      <PageBackground images={celestialPortal} variant="glass" />

      {/* ── Animated star canvas ── */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none opacity-40 z-0"
      />

      {/* ── Constellation layer ── */}
      <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden">
        {constellations.map((con, i) => (
          <svg
            key={`con-${i}`}
            viewBox="0 0 100 100"
            style={{
              position: "absolute",
              left: `${con.x}%`,
              top: `${con.y}%`,
              width: "250px",
              height: "250px",
              rotate: `${con.rotate}deg`,
              scale: `${con.scale}`,
              opacity: con.opacity,
            }}
          >
            <path
              d={con.path}
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="0.5"
              strokeDasharray="2, 4"
            />
            {con.stars.map(([cx, cy], idx) => (
              <circle
                key={idx}
                cx={cx}
                cy={cy}
                r="1"
                fill="white"
                style={{ filter: "drop-shadow(0 0 2px white)" }}
              />
            ))}
          </svg>
        ))}
      </div>

      {/* ── Radial vignette ── (softened so the Glider's full-bleed per-tier
             scene stays visible instead of fading to solid dark) */}
      <div
        className="fixed inset-0 z-[2] pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 15% 10%, color-mix(in srgb, var(--gl-accent) 14%, transparent) 0%, transparent 34%),
            radial-gradient(circle at 85% 20%, color-mix(in srgb, var(--gl-accent) 9%, transparent) 0%, transparent 30%),
            linear-gradient(180deg, color-mix(in srgb, var(--gl-base) 20%, transparent) 0%, transparent 45%, color-mix(in srgb, var(--gl-base) 70%, transparent) 100%)
          `,
        }}
      />

      {/* ── Page content ── */}
      <div className="relative z-10 mx-auto max-w-[1280px]">
        {/* ── Stardust glider (custom amount) — primary, centered like home ── */}
        <div className="mx-auto mb-8 max-w-5xl sm:mb-10">
          <StardustGlider
            loading={paymentLoading}
            onPurchase={handleStardustPurchase}
          />
        </div>

        {/* ── Header ── */}
        <div className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          <section
            className="relative overflow-hidden rounded-[28px] border p-6 sm:p-8 md:p-10"
            style={{
              background: `linear-gradient(135deg, color-mix(in srgb, var(--gl-glass) 95%, transparent) 0%, color-mix(in srgb, var(--gl-base) 93%, transparent) 62%, color-mix(in srgb, var(--gl-glass-2) 72%, transparent) 100%)`,
              borderColor: "rgba(255,255,255,0.09)",
              boxShadow: "0 24px 70px rgba(0,0,0,0.42)",
            }}
          >
            <div
              className="absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
              style={{ backgroundColor: `color-mix(in srgb, var(--gl-accent) 9%, transparent)` }}
            />
            <div className="relative">
              <div className="mb-6 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 backdrop-blur-xl">
                <Icon
                  icon="ph:sparkle-fill"
                  className="text-sm"
                  style={{ color: "var(--gl-accent)" }}
                />
                <span className="text-[9px] font-black uppercase tracking-[0.28em] text-white/60">
                  Billing Dashboard
                </span>
              </div>

              <h1
                className="max-w-3xl text-4xl font-black uppercase leading-[0.92] sm:text-6xl md:text-7xl"
                style={{
                  fontFamily: "var(--gl-serif)",
                  color: "var(--gl-text)",
                }}
              >
                Reload your{" "}
                <span
                  style={{
                    background: `linear-gradient(135deg, var(--gl-accent) 0%, var(--gl-accent) 100%)`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  stardust
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-white/55 sm:text-base">
                Choose any amount, complete secure Stripe checkout, and keep your
                reading credits ready when the moment calls.
              </p>

              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="mb-2 flex items-center gap-2 text-white/40">
                    <Icon icon="solar:card-bold-duotone" className="text-lg" />
                    <span className="text-[8px] font-black uppercase tracking-[0.22em]">
                      Checkout
                    </span>
                  </div>
                  <div className="text-sm font-black uppercase text-white">
                    Stripe Secure
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="mb-2 flex items-center gap-2 text-white/40">
                    <Icon
                      icon="solar:history-bold-duotone"
                      className="text-lg"
                    />
                    <span className="text-[8px] font-black uppercase tracking-[0.22em]">
                      Ledger
                    </span>
                  </div>
                  <div className="text-sm font-black uppercase text-white">
                    {transactionsData?.total ?? 0} Records
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="mb-2 flex items-center gap-2 text-white/40">
                    <Icon
                      icon="solar:shield-check-bold-duotone"
                      className="text-lg"
                    />
                    <span className="text-[8px] font-black uppercase tracking-[0.22em]">
                      Status
                    </span>
                  </div>
                  <div className="text-sm font-black uppercase text-white">
                    Active
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside
            className="relative overflow-hidden rounded-[28px] border p-6 sm:p-8"
            style={{
              background: `linear-gradient(180deg, color-mix(in srgb, var(--gl-glass) 96%, transparent) 0%, color-mix(in srgb, var(--gl-base) 95%, transparent) 100%)`,
              borderColor: `color-mix(in srgb, var(--gl-accent) 13%, transparent)`,
              boxShadow: `0 24px 70px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}
          >
            <div
              className="absolute inset-x-8 top-0 h-px"
              style={{ backgroundColor: "var(--gl-accent)" }}
            />
            <div className="relative flex h-full flex-col justify-between">
              <div>
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/40">
                      Available Balance
                    </p>
                    <p className="mt-2 text-sm text-white/45">
                      Ready for readings
                    </p>
                  </div>
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--gl-accent) 7%, transparent)`,
                      borderColor: `color-mix(in srgb, var(--gl-accent) 14%, transparent)`,
                    }}
                  >
                    <Icon
                      icon="ph:sparkle-fill"
                      className="text-2xl"
                      style={{ color: "var(--gl-accent)" }}
                    />
                  </div>
                </div>

                <div className="flex items-end gap-3">
                  <span
                    className="text-6xl font-black leading-none sm:text-7xl"
                    style={{
                      background: `linear-gradient(135deg, #fff 0%, var(--gl-accent) 100%)`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {balance?.balance?.toLocaleString() ?? "0"}
                  </span>
                  <span
                    className="pb-2 text-sm font-black uppercase tracking-[0.22em]"
                    style={{ color: "var(--gl-accent)" }}
                  >
                    Points
                  </span>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                    Rate
                  </span>
                  <span className="text-sm font-black text-white">
                    £1 = 1 Stardust
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                    Top Bonus
                  </span>
                  <span
                    className="text-sm font-black"
                    style={{ color: "var(--gl-accent)" }}
                  >
                    +60% Devotion
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* ── Global error banner ── */}
        {paymentError && (
          <div
            className="mb-8 rounded-2xl border border-red-500/20 p-5 backdrop-blur-xl"
            style={{
              backgroundColor: "rgba(248, 113, 113, 0.1)",
              boxShadow: "0 18px 44px rgba(0,0,0,0.24)",
            }}
          >
            <div className="flex items-center gap-3">
              <Icon
                icon="solar:danger-circle-bold-duotone"
                className="text-3xl text-red-400 flex-shrink-0"
              />
              <p className="text-red-400 text-sm font-medium">{paymentError}</p>
            </div>
          </div>
        )}

        {/* ── Transaction history ── */}
        <div
          className="relative mb-8 overflow-hidden rounded-[28px] border border-white/10 p-5 backdrop-blur-xl sm:mb-12 sm:p-8 md:p-10"
          style={{
            background: `linear-gradient(180deg, color-mix(in srgb, var(--gl-glass) 91%, transparent) 0%, color-mix(in srgb, var(--gl-base) 85%, transparent) 100%)`,
            boxShadow: "0 22px 70px rgba(0,0,0,0.34)",
          }}
        >
          {/* Section header */}
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-3 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                <Icon
                  icon="solar:history-bold-duotone"
                  style={{ color: "var(--gl-accent)" }}
                  className="text-base"
                />
                <span className="text-[9px] font-black uppercase tracking-[0.24em] text-white/45">
                  Ledger
                </span>
              </div>
              <h2
                className="text-3xl font-black uppercase tracking-normal sm:text-4xl"
                style={{ color: "var(--gl-text)" }}
              >
                Transaction History
              </h2>
            </div>

            {transactions.length > 0 && (
              <div
                className="rounded-2xl border border-white/10 px-4 py-3 backdrop-blur-xl"
                style={{ backgroundColor: "rgba(255,255,255,0.035)" }}
              >
                <span
                  className="text-[9px] font-black uppercase tracking-[0.2em]"
                  style={{ color: "var(--gl-accent)" }}
                >
                  {transactionsData?.total ?? 0} Total
                </span>
              </div>
            )}
          </div>

          {/* Loading state */}
          {paymentLoading && transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Icon
                icon="svg-spinners:3-dots-fade"
                className="text-5xl mb-4"
                style={{ color: "var(--gl-accent)" }}
              />
              <p
                className="text-sm opacity-50"
                style={{ color: "var(--gl-text-dim)" }}
              >
                Loading transactions…
              </p>
            </div>
          ) : transactions.length === 0 ? (
            /* Empty state */
            <div
              className="rounded-[24px] border border-white/10 p-8 text-center backdrop-blur-xl sm:p-12 md:p-16"
              style={{
                backgroundColor: "rgba(255,255,255,0.035)",
                boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
              }}
            >
              <Icon
                icon="solar:document-text-bold-duotone"
                className="text-5xl sm:text-7xl mx-auto mb-4 sm:mb-6 opacity-20"
                style={{ color: "var(--gl-text-dim)" }}
              />
              <h3
                className="text-lg sm:text-xl font-black uppercase mb-2"
                style={{ color: "var(--gl-text-dim)" }}
              >
                No Transactions Yet
              </h3>
              <p
                className="text-xs sm:text-sm opacity-50"
                style={{ color: "var(--gl-text-dim)" }}
              >
                Your transaction history will appear here
              </p>
            </div>
          ) : (
            <>
              {/* Transaction list */}
              <div className="space-y-3">
                {transactions.map((transaction: Transaction) => {
                  const typeDisplay = getTypeDisplay(
                    transaction.transaction_type,
                  );
                  const statusDisplay = getStatusDisplay(transaction.status);
                  const isCredit = [
                    TransactionType.CREDIT,
                    TransactionType.BONUS,
                    TransactionType.GIFT,
                    TransactionType.REFUND,
                  ].includes(transaction.transaction_type);

                  return (
                    <div
                      key={transaction.id}
                      className="group relative overflow-hidden rounded-[22px] border border-white/10 p-4 backdrop-blur-xl transition-all hover:border-white/20 sm:p-5 md:p-6"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.035)",
                        boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
                      }}
                    >
                      {/* Row hover glow */}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{
                          background: `linear-gradient(135deg, ${typeDisplay.color}05 0%, transparent 70%)`,
                        }}
                      />

                      <div className="relative z-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center sm:gap-6">
                        {/* Left: icon + meta */}
                        <div className="flex w-full items-center gap-3 sm:w-auto sm:gap-5">
                          <div
                            className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14"
                            style={{
                              backgroundColor: `${typeDisplay.color}15`,
                              border: `2px solid ${typeDisplay.color}30`,
                            }}
                          >
                            <Icon
                              icon={typeDisplay.icon}
                              className="text-xl sm:text-3xl"
                              style={{ color: typeDisplay.color }}
                            />
                          </div>

                          <div className="min-w-0 flex-1 sm:flex-none">
                            <div className="mb-1 flex flex-col gap-1 sm:mb-2 sm:flex-row sm:items-center sm:gap-3">
                              <span className="truncate text-sm font-bold text-white sm:text-base">
                                {transaction.description}
                              </span>
                              <div
                                className="flex items-center gap-1.5 self-start rounded-full px-2 py-0.5 sm:self-auto sm:px-3 sm:py-1"
                                style={{
                                  backgroundColor: `${statusDisplay.color}15`,
                                  border: `1px solid ${statusDisplay.color}30`,
                                }}
                              >
                                <div
                                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                                  style={{
                                    backgroundColor: statusDisplay.color,
                                  }}
                                />
                                <span
                                  className="font-black uppercase tracking-wider"
                                  style={{
                                    color: statusDisplay.color,
                                    fontSize: "9px",
                                  }}
                                >
                                  {statusDisplay.label}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                              <span
                                className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide flex items-center gap-2"
                                style={{ color: "var(--gl-text-dim)" }}
                              >
                                <Icon
                                  icon="solar:calendar-bold-duotone"
                                  className="text-xs sm:text-sm"
                                />
                                {formatDate(transaction.created_at)}
                              </span>
                              <span
                                className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider opacity-40 flex items-center gap-1"
                                style={{ color: "var(--gl-text-dim)" }}
                              >
                                <Icon
                                  icon="solar:hashtag-bold"
                                  className="text-[10px] sm:text-xs"
                                />
                                {String(transaction.id).padStart(6, "0")}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right: amount */}
                        <div className="self-end text-right sm:self-auto">
                          <div
                            className="mb-1 text-2xl font-black sm:text-3xl"
                            style={{ color: isCredit ? "#4ADE80" : "#F87171" }}
                          >
                            {isCredit ? "+" : "-"}
                            {transaction.amount.toLocaleString()}
                          </div>
                          <div
                            className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider opacity-50"
                            style={{ color: "var(--gl-text-dim)" }}
                          >
                            Balance:{" "}
                            {transaction.balance_after.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {transactionsData && transactionsData.pages > 1 && (
                <div
                  className="flex flex-col md:flex-row items-center justify-between mt-8 sm:mt-10 gap-4 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 backdrop-blur-xl"
                  style={{ backgroundColor: `color-mix(in srgb, var(--gl-glass) 50%, transparent)` }}
                >
                  <div
                    className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider opacity-60 text-center md:text-left"
                    style={{ color: "var(--gl-text-dim)" }}
                  >
                    Page {currentPage} of {transactionsData.pages} •{" "}
                    {transactionsData.total} transactions
                  </div>

                  <div
                    className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-xl sm:rounded-2xl border backdrop-blur-xl"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--gl-base) 80%, transparent)`,
                      borderColor: `color-mix(in srgb, var(--gl-accent) 13%, transparent)`,
                    }}
                  >
                    {/* Prev */}
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => p - 1)}
                      className="p-2 sm:p-3 rounded-xl transition-all hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <Icon
                        icon="solar:alt-arrow-left-linear"
                        className="text-xl"
                        style={{ color: "var(--gl-accent)" }}
                      />
                    </button>

                    {/* Page numbers */}
                    <div className="flex items-center gap-1 sm:gap-2 px-1 sm:px-2">
                      {Array.from(
                        { length: transactionsData.pages },
                        (_, i) => i + 1,
                      )
                        .filter(
                          (page) =>
                            page === 1 ||
                            page === transactionsData.pages ||
                            Math.abs(page - currentPage) <= 1,
                        )
                        .map((page, idx, arr) => {
                          const prevPage = arr[idx - 1];
                          const showEllipsis =
                            prevPage !== undefined && page - prevPage > 1;
                          return (
                            <div
                              key={page}
                              className="flex items-center gap-1 sm:gap-2"
                            >
                              {showEllipsis && (
                                <span
                                  className="px-1 sm:px-2 text-[10px] sm:text-xs"
                                  style={{ color: "var(--gl-text-dim)" }}
                                >
                                  …
                                </span>
                              )}
                              <button
                                onClick={() => setCurrentPage(page)}
                                className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black transition-all border"
                                style={{
                                  backgroundColor:
                                    currentPage === page
                                      ? "var(--gl-accent)"
                                      : "transparent",
                                  color:
                                    currentPage === page
                                      ? "var(--gl-base)"
                                      : "var(--gl-text-dim)",
                                  borderColor:
                                    currentPage === page
                                      ? "var(--gl-accent)"
                                      : "transparent",
                                  boxShadow:
                                    currentPage === page
                                      ? `0 0 20px color-mix(in srgb, var(--gl-accent) 25%, transparent)`
                                      : "none",
                                }}
                              >
                                {page}
                              </button>
                            </div>
                          );
                        })}
                    </div>

                    {/* Next */}
                    <button
                      disabled={currentPage === transactionsData.pages}
                      onClick={() => setCurrentPage((p) => p + 1)}
                      className="p-2 sm:p-3 rounded-xl transition-all hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <Icon
                        icon="solar:alt-arrow-right-linear"
                        className="text-xl"
                        style={{ color: "var(--gl-accent)" }}
                      />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Success modal ── */}
      {showSuccessModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            backgroundColor: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(10px)",
          }}
          onClick={closeSuccessModal}
        >
          <div
            className="p-6 sm:p-10 rounded-[24px] sm:rounded-[40px] border max-w-md w-full relative overflow-hidden mx-4 sm:mx-0"
            style={{
              backgroundColor: `color-mix(in srgb, var(--gl-glass) 87%, transparent)`,
              borderColor: `color-mix(in srgb, var(--gl-accent) 38%, transparent)`,
              boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 80px color-mix(in srgb, var(--gl-accent) 19%, transparent)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Floating particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    left: `${(i * 8) % 100}%`,
                    top: `${(i * 13 + 5) % 100}%`,
                    backgroundColor: "var(--gl-accent)",
                    opacity: 0.3,
                  }}
                />
              ))}
            </div>

            <div className="text-center relative z-10">
              <div
                className="w-20 h-20 sm:w-28 sm:h-28 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 relative"
                style={{
                  backgroundColor: `color-mix(in srgb, var(--gl-accent) 13%, transparent)`,
                  border: `3px solid color-mix(in srgb, var(--gl-accent) 25%, transparent)`,
                }}
              >
                <Icon
                  icon="solar:check-circle-bold-duotone"
                  className="text-7xl"
                  style={{ color: "var(--gl-accent)" }}
                />
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    border: `2px solid var(--gl-accent)`,
                    opacity: 0.5,
                  }}
                />
              </div>

              <h2
                className="text-3xl sm:text-4xl md:text-5xl font-black uppercase mb-3 sm:mb-4"
                style={{
                  background: `linear-gradient(135deg, var(--gl-accent) 0%, var(--gl-accent) 100%)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Success!
              </h2>
              <p
                className="text-sm sm:text-base mb-6 sm:mb-8 font-light px-2"
                style={{ color: "var(--gl-text-dim)" }}
              >
                Your top-up was successful! Your Stardust has been added to your
                account.
              </p>

              <button
                onClick={closeSuccessModal}
                className="w-full py-3 sm:py-4 rounded-2xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all relative overflow-hidden group"
                style={{
                  backgroundColor: "var(--gl-accent)",
                  color: "var(--gl-base)",
                  boxShadow: `0 10px 40px color-mix(in srgb, var(--gl-accent) 25%, transparent)`,
                }}
              >
                <span className="relative z-10">Continue</span>
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background: `linear-gradient(135deg, var(--gl-accent) 0%, var(--gl-accent) 100%)`,
                  }}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Error modal ── */}
      {showErrorModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            backgroundColor: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(10px)",
          }}
          onClick={closeErrorModal}
        >
          <div
            className="p-6 sm:p-10 rounded-[24px] sm:rounded-[40px] border max-w-md w-full relative overflow-hidden mx-4 sm:mx-0"
            style={{
              backgroundColor: `color-mix(in srgb, var(--gl-glass) 87%, transparent)`,
              borderColor: "rgba(248,113,113,0.6)",
              boxShadow:
                "0 30px 80px rgba(0,0,0,0.5), 0 0 80px rgba(248,113,113,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Floating particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    left: `${(i * 12) % 100}%`,
                    top: `${(i * 17 + 5) % 100}%`,
                    backgroundColor: "#F87171",
                    opacity: 0.2,
                  }}
                />
              ))}
            </div>

            <div className="text-center relative z-10">
              <div
                className="w-20 h-20 sm:w-28 sm:h-28 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 relative"
                style={{
                  backgroundColor: "rgba(248,113,113,0.15)",
                  border: "3px solid rgba(248,113,113,0.3)",
                }}
              >
                <Icon
                  icon="solar:close-circle-bold-duotone"
                  className="text-5xl sm:text-7xl"
                  style={{ color: "#F87171" }}
                />
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ border: "2px solid #F87171", opacity: 0.5 }}
                />
              </div>

              <h2
                className="text-3xl sm:text-4xl md:text-5xl font-black uppercase mb-3 sm:mb-4"
                style={{ color: "#F87171" }}
              >
                Payment Failed
              </h2>
              <p
                className="text-sm sm:text-base mb-6 sm:mb-8 font-light px-2"
                style={{ color: "var(--gl-text-dim)" }}
              >
                Your payment could not be processed. Please try again or{" "}
                <a
                  href="mailto:support@askvalentina.co.uk"
                  className="underline hover:opacity-80 transition-opacity"
                  style={{ color: "var(--gl-accent)" }}
                >
                  contact support
                </a>{" "}
                if the issue persists.
              </p>

              <button
                onClick={closeErrorModal}
                className="w-full py-3 sm:py-4 rounded-2xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all relative overflow-hidden group"
                style={{
                  backgroundColor: "#F87171",
                  color: "var(--gl-base)",
                  boxShadow: "0 10px 40px rgba(248,113,113,0.4)",
                }}
              >
                <span className="relative z-10">Try Again</span>
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background:
                      "linear-gradient(135deg, #F87171 0%, #EF4444 100%)",
                  }}
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;

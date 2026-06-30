import { useState, useEffect, useRef, useMemo } from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { Icon } from "@iconify/react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { usePayment } from "../hooks/usePayment";
import { paymentApi } from "../api/paymentApi";
import {
  TransactionStatus,
  TransactionType,
  type Transaction,
} from "../../ledger/types/transaction.types";
import axiosClient from "../../../lib/axiosClient";

const SYMBOLS_LIST = ["\uD83D\uDD02", "\uD83D\uDD01", "\uD83D\uDD03"];

const DEFAULT_PACKAGES = {
  badge: "The Sacred Offerings",
  heading: "Choose the",
  headingHighlighted: "Depth",
  subheading: "of Your Insight",
  packages: [
    {
      title: "Whisper Message",
      price: "15",
      tagline: "A quiet message from spirit, just for you.",
      features: [
        "1 Psychic Question Answered",
        "Clear and honest intuitive insight",
        "Energy-focused response",
      ],
      footer: "Perfect for when you need one clear answer.",
      cta: "Receive My Whisper Message",
      popular: false,
      label: "",
      points: 0,
    },
    {
      title: "Two-Fold Truth",
      price: "20",
      tagline: "Double the clarity. Double the alignment.",
      features: [
        "2 Psychic Questions Answered",
        "Additional energy message",
        "Expanded soul-connected detail",
      ],
      footer: "For those pulled between two options or paths.",
      cta: "Reveal My Two-Fold Truth",
      popular: true,
      label: "Most Chosen by Returning Clients",
      points: 0,
    },
    {
      title: "Deep Soul Access",
      price: "70",
      tagline: "Your full energetic reading \u2014 raw and real.",
      features: [
        "Ask up to 10 questions",
        "Full spiritual overview (Audio/Written)",
        "Channeled card spread image",
        "1 Follow-up question (48h)",
      ],
      footer: "Unlock deep guidance and the full picture.",
      cta: "Access Deep Soul Reading",
      popular: false,
      label: "",
      points: 0,
    },
  ],
};
interface BillingPackage {
  id: string;
  _id?: string;
  points: number;
  amount: number;
  price: number;
  label: string;
  is_active?: boolean;
  sort_order?: number;
}

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
  const [content, setContent] = useState(DEFAULT_PACKAGES);

  useEffect(() => {
    axiosClient
      .get("/landing/packages")
      .then((res) => {
        if (res.data?.content)
          setContent({ ...DEFAULT_PACKAGES, ...res.data.content });
      })
      .catch(() => { });
  }, []);

  const {
    loading: paymentLoading,
    error: paymentError,
    transactions: transactionsData,
    balance,
    unitPrice,
    createCheckoutSession,
    createCheckoutPackageSession,
    fetchMyTransactions,
    fetchMyBalance,
    fetchUnitPrice,
  } = usePayment();

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(
    null,
  );
  const [selectedBigPackageId, setSelectedBigPackageId] = useState<
    string | null
  >(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [cardsPerView, setCardsPerView] = useState(3);

  // Buy options API state
  const [apiPackages, setApiPackages] = useState<BillingPackage[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Canvas & refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const carouselContainerRef = useRef<HTMLDivElement>(null);
  const [windowSize, setWindowSize] = useState({ width: 1920, height: 1080 });
  const containerRef = useRef(null);

  // ─── Fetch buy options from API ─────────────────────────────────────────────
  useEffect(() => {
    const fetchApiOptions = async () => {
      try {
        setApiLoading(true);
        setApiError(null);
        const data = await paymentApi.getBuyOptions();
        const mappedOptions = data.map((option: any, idx: number) => ({
          ...option,
          id: option.id || option._id || `tier-${idx}`,
          points: option.points || option.amount || 0,
          amount: option.points || option.amount || 0,
          label: option.label || "Stardust Pack",
          price: option.price_cents || option.price || 0,
        }));
        setApiPackages(mappedOptions);
      } catch (err: any) {
        const msg =
          err.response?.data?.message ||
          err.message ||
          "Failed to load point offers.";
        setApiError(msg);
      } finally {
        setApiLoading(false);
      }
    };
    fetchApiOptions();
  }, []);

  // ─── Build packages list ────────────────────────────────────────────────────
  const pointsPackages: BillingPackage[] = useMemo(() => {
    const pricePerPoint = unitPrice?.unit_price_cents || 100;
    if (apiPackages.length > 0) {
      return apiPackages.map((pkg) => ({
        ...pkg,
        price: pkg.price || pricePerPoint * pkg.points,
      }));
    }
    return [
      {
        id: "starter",
        points: 5,
        amount: 5,
        price: pricePerPoint * 5,
        label: "Starter",
      },
      {
        id: "basic",
        points: 20,
        amount: 20,
        price: pricePerPoint * 20,
        label: "Basic",
      },
      {
        id: "popular",
        points: 50,
        amount: 50,
        price: pricePerPoint * 50,
        label: "Popular",
      },
      {
        id: "pro",
        points: 100,
        amount: 100,
        price: pricePerPoint * 100,
        label: "Pro",
      },
      {
        id: "premium",
        points: 250,
        amount: 250,
        price: pricePerPoint * 250,
        label: "Premium",
      },
      {
        id: "elite",
        points: 500,
        amount: 500,
        price: pricePerPoint * 500,
        label: "Elite",
      },
    ];
  }, [unitPrice, apiPackages]);

  // ─── Stable constellation data (no random on re-render) ────────────────────
  const constellations = useMemo(() => {
    // Seeded-ish positions using index math so they're stable
    return Array.from({ length: 6 }).map((_, i) => {
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
  }, []);

  // ─── Responsive cards per view ──────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setCardsPerView(w < 768 ? 1 : w < 1024 ? 2 : 3);
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
    fetchUnitPrice();
    fetchMyBalance();
    fetchMyTransactions({ page: currentPage, limit: 10 });
  }, [currentPage]);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount / 100);

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    navigate(window.location.pathname, { replace: true });
  };

  const closeErrorModal = () => {
    setShowErrorModal(false);
    navigate(window.location.pathname, { replace: true });
  };

  const handlePurchase = async (pkg: BillingPackage) => {
    setSelectedPackageId(pkg.id);
    try {
      const returnUrl = searchParams.get("return_url");
      await createCheckoutSession({
        points_amount: pkg.points,
        return_url:
          returnUrl || `${window.location.origin}/billing?status=success`,
      });
    } catch (err) {
      console.error("Failed to create checkout session:", err);
      setShowErrorModal(true);
    } finally {
      setSelectedPackageId(null);
    }
  };

  const handlePurchasePackage = async (pkg: BillingPackage) => {
    setSelectedBigPackageId(pkg.id);

    try {
      const returnUrl = searchParams.get("return_url");

      await createCheckoutPackageSession({
        title: pkg.label,
        return_url:
          returnUrl || `${window.location.origin}/billing?status=success`,
      });

    } catch (err) {
      console.error("Failed to create checkout session:", err);
      setShowErrorModal(true);
    } finally {
      setSelectedBigPackageId(null);
    }
  };

  // ─── Derived state ───────────────────────────────────────────────────────────
  const transactions = transactionsData?.transactions || [];
  const combinedLoading = paymentLoading || apiLoading;
  const combinedError = paymentError || apiError;
  const maxCarouselIndex = Math.max(
    0,
    Math.ceil(pointsPackages.length / cardsPerView) - 1,
  );
  const selectedPackage = pointsPackages.find(
    (pkg) => pkg.id === selectedPackageId,
  );
  const bestValuePackage = pointsPackages.reduce<BillingPackage | null>(
    (best, pkg) => {
      if (pkg.points <= 0 || pkg.price <= 0) return best;
      if (!best || pkg.price / pkg.points < best.price / best.points)
        return pkg;
      return best;
    },
    null,
  );

  useEffect(() => {
    setCarouselIndex((index) => Math.min(index, maxCarouselIndex));
  }, [maxCarouselIndex]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const smoothScroll = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
  });
  const floatY = useTransform(smoothScroll, [0, 1], [0, -60]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative min-h-screen overflow-hidden px-4 pb-10 pt-28 sm:px-6 md:px-10 md:pt-32"
      style={{
        backgroundColor: COLORS.dark,
        fontFamily: TYPOGRAPHY.fontFamily.body,
      }}
    >
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

      {/* ── Radial vignette ── */}
      <div
        className="fixed inset-0 z-[2] pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 15% 10%, ${COLORS.primary}24 0%, transparent 34%),
            radial-gradient(circle at 85% 20%, ${COLORS.secondary}18 0%, transparent 30%),
            linear-gradient(180deg, ${COLORS.dark}55 0%, ${COLORS.dark} 68%)
          `,
        }}
      />

      {/* ── Page content ── */}
      <div className="relative z-10 mx-auto max-w-[1280px]">
        {/* ── Header ── */}
        <div className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          <section
            className="relative overflow-hidden rounded-[28px] border p-6 sm:p-8 md:p-10"
            style={{
              background: `linear-gradient(135deg, ${COLORS.surface}f2 0%, ${COLORS.dark}ee 62%, ${COLORS.surfaceAccent}b8 100%)`,
              borderColor: "rgba(255,255,255,0.09)",
              boxShadow: "0 24px 70px rgba(0,0,0,0.42)",
            }}
          >
            <div
              className="absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
              style={{ backgroundColor: `${COLORS.primary}18` }}
            />
            <div className="relative">
              <div className="mb-6 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 backdrop-blur-xl">
                <Icon
                  icon="ph:sparkle-fill"
                  className="text-sm"
                  style={{ color: COLORS.primary }}
                />
                <span className="text-[9px] font-black uppercase tracking-[0.28em] text-white/60">
                  Billing Dashboard
                </span>
              </div>

              <h1
                className="max-w-3xl text-4xl font-black uppercase leading-[0.92] sm:text-6xl md:text-7xl"
                style={{
                  fontFamily: TYPOGRAPHY.fontFamily.heading,
                  color: COLORS.neutralWhite,
                }}
              >
                Reload your{" "}
                <span
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  stardust
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-white/55 sm:text-base">
                Choose a tier, complete secure Stripe checkout, and keep your
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
              background: `linear-gradient(180deg, ${COLORS.surface}f5 0%, ${COLORS.dark}f2 100%)`,
              borderColor: `${COLORS.primary}22`,
              boxShadow: `0 24px 70px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}
          >
            <div
              className="absolute inset-x-8 top-0 h-px"
              style={{ backgroundColor: COLORS.primary }}
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
                      backgroundColor: `${COLORS.primary}12`,
                      borderColor: `${COLORS.primary}24`,
                    }}
                  >
                    <Icon
                      icon="ph:sparkle-fill"
                      className="text-2xl"
                      style={{ color: COLORS.primary }}
                    />
                  </div>
                </div>

                <div className="flex items-end gap-3">
                  <span
                    className="text-6xl font-black leading-none sm:text-7xl"
                    style={{
                      background: `linear-gradient(135deg, #fff 0%, ${COLORS.primary} 100%)`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {balance?.balance?.toLocaleString() ?? "0"}
                  </span>
                  <span
                    className="pb-2 text-sm font-black uppercase tracking-[0.22em]"
                    style={{ color: COLORS.primary }}
                  >
                    Points
                  </span>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                    Best Value
                  </span>
                  <span className="text-sm font-black text-white">
                    {bestValuePackage?.label ?? "Loading"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
                    Selected
                  </span>
                  <span className="text-sm font-black text-white">
                    {selectedPackage?.label ?? "Choose Tier"}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* ── Buy Points carousel ── */}
        <div
          className="relative mb-8 overflow-hidden rounded-[28px] border border-white/10 p-5 backdrop-blur-xl sm:mb-10 sm:p-8 md:p-10"
          style={{
            background: `linear-gradient(180deg, ${COLORS.surface}e8 0%, ${COLORS.dark}d8 100%)`,
            boxShadow: "0 22px 70px rgba(0,0,0,0.34)",
          }}
        >
          <div className="absolute inset-0 overflow-hidden opacity-40 pointer-events-none">
            <div
              className="absolute -right-32 -top-32 h-96 w-96 rounded-full blur-3xl"
              style={{ backgroundColor: `${COLORS.primary}18` }}
            />
            <div
              className="absolute -bottom-44 left-1/4 h-80 w-80 rounded-full blur-3xl"
              style={{ backgroundColor: `${COLORS.secondary}12` }}
            />
          </div>

          <div className="relative z-10">
            <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <div className="mb-3 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                  <Icon
                    icon="solar:bag-smile-bold-duotone"
                    style={{ color: COLORS.primary }}
                    className="text-base"
                  />
                  <span className="text-[9px] font-black uppercase tracking-[0.24em] text-white/45">
                    Stardust Tiers
                  </span>
                </div>
                <h2
                  className="text-3xl font-black uppercase tracking-normal sm:text-4xl"
                  style={{ color: COLORS.neutralWhite }}
                >
                  Choose your pack
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">
                  The same live tiers from the Stardust modal, tuned for faster
                  comparison.
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-2">
                <button
                  onClick={() => setCarouselIndex((i) => Math.max(0, i - 1))}
                  disabled={carouselIndex === 0}
                  className="flex h-11 w-11 items-center justify-center rounded-xl transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
                >
                  <Icon
                    icon="ph:caret-left-bold"
                    className="text-xl"
                    style={{ color: COLORS.primary }}
                  />
                </button>
                <div className="min-w-[86px] text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
                  {carouselIndex + 1} / {maxCarouselIndex + 1}
                </div>
                <button
                  onClick={() =>
                    setCarouselIndex((i) => Math.min(maxCarouselIndex, i + 1))
                  }
                  disabled={carouselIndex >= maxCarouselIndex}
                  className="flex h-11 w-11 items-center justify-center rounded-xl transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
                >
                  <Icon
                    icon="ph:caret-right-bold"
                    className="text-xl"
                    style={{ color: COLORS.primary }}
                  />
                </button>
              </div>
            </div>

            {/* Cards */}
            <div className="overflow-hidden" ref={carouselContainerRef}>
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${carouselIndex * 100}%)` }}
              >
                {pointsPackages.map((pkg, idx) => {
                  const isSelected = selectedPackageId === pkg.id;
                  const isProcessing = paymentLoading && isSelected;
                  const isPopular = idx === 2 || pkg.points === 50;
                  const paddingStyle =
                    idx === 0
                      ? "0 0.75rem 0 0"
                      : idx === pointsPackages.length - 1
                        ? "0 0 0 0.75rem"
                        : "0 0.75rem";

                  return (
                    <div
                      key={pkg.id || `${pkg.label}-${idx}`}
                      className="flex-shrink-0"
                      style={{
                        width: `${100 / cardsPerView}%`,
                        padding: paddingStyle,
                      }}
                    >
                      <div
                        className={`relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[24px] p-5 transition-all duration-300 group sm:p-6 ${isSelected ? "border-2" : "border border-white/10"
                          }`}
                        style={{
                          background: isPopular
                            ? `linear-gradient(180deg, ${COLORS.primary}14 0%, ${COLORS.dark}f2 55%)`
                            : `linear-gradient(180deg, rgba(255,255,255,0.035) 0%, ${COLORS.dark}e8 100%)`,
                          backdropFilter: "blur(20px)",
                          borderColor:
                            isSelected || isPopular
                              ? `${COLORS.primary}66`
                              : undefined,
                          boxShadow: isSelected
                            ? `0 0 42px ${COLORS.primary}24, 0 18px 44px rgba(0,0,0,0.44)`
                            : "0 14px 36px rgba(0,0,0,0.28)",
                          minHeight: "340px",
                        }}
                        onClick={() => setSelectedPackageId(pkg.id)}
                      >
                        {/* Hover gradient */}
                        <div
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                          style={{
                            background: `radial-gradient(circle at 50% 0%, ${COLORS.primary}15 0%, transparent 70%)`,
                          }}
                        />

                        <div className="relative z-10 flex h-full flex-col">
                          {/* Label badge */}
                          <div className="mb-6 flex items-start gap-3">
                            <div
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-xs font-black"
                              style={{
                                backgroundColor: `${COLORS.primary}15`,
                                borderColor: `${COLORS.primary}30`,
                                color: COLORS.primary,
                              }}
                            >
                              {pkg.label.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate text-[10px] font-black uppercase tracking-[0.2em]"
                                style={{ color: COLORS.neutralWhite }}
                              >
                                {pkg.label}
                              </div>
                              <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">
                                {formatCurrency(
                                  pkg.price / Math.max(pkg.points, 1),
                                )}{" "}
                                / point
                              </div>
                            </div>
                            {isPopular && (
                              <div
                                className="shrink-0 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-[0.15em]"
                                style={{
                                  backgroundColor: COLORS.primary,
                                  color: COLORS.dark,
                                }}
                              >
                                Choice
                              </div>
                            )}
                          </div>

                          {/* Points amount */}
                          <div className="mb-7">
                            <div
                              className="mb-2 text-5xl font-black tracking-normal sm:text-6xl"
                              style={{
                                background: `linear-gradient(135deg, ${COLORS.neutralWhite} 0%, ${COLORS.primary} 100%)`,
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                backgroundClip: "text",
                              }}
                            >
                              {pkg.points.toLocaleString()}
                            </div>
                            <div
                              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
                              style={{ color: COLORS.neutralGray }}
                            >
                              <Icon
                                icon="ph:sparkle-fill"
                                style={{ color: COLORS.primary }}
                              />
                              Points Included
                            </div>
                          </div>

                          {/* Price */}
                          <div className="mb-auto rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/35">
                              Total
                            </div>
                            <div
                              className="mt-1 text-3xl font-black sm:text-4xl"
                              style={{ color: COLORS.primary }}
                            >
                              {formatCurrency(pkg.price)}
                            </div>
                          </div>

                          {/* Buy button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePurchase(pkg);
                            }}
                            disabled={combinedLoading}
                            className="group/btn relative mt-5 w-full overflow-hidden rounded-2xl px-4 py-4 text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 sm:px-6"
                            style={{
                              backgroundColor: COLORS.primary,
                              color: COLORS.dark,
                              boxShadow: `0 10px 30px ${COLORS.primary}30`,
                            }}
                          >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                              {isProcessing ? (
                                <>
                                  <Icon
                                    icon="svg-spinners:3-dots-fade"
                                    className="text-base"
                                  />
                                  Processing…
                                </>
                              ) : (
                                "Buy Now"
                              )}
                            </span>
                            <div
                              className="absolute inset-0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"
                              style={{
                                background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
                              }}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Carousel navigation */}
            <div className="mt-7 flex items-center justify-center">
              <div className="flex gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                {Array.from({ length: maxCarouselIndex + 1 }).map(
                  (_, index) => (
                    <button
                      key={index}
                      onClick={() => setCarouselIndex(index)}
                      style={{
                        width: carouselIndex === index ? "40px" : "10px",
                        height: "10px",
                        borderRadius: "5px",
                        backgroundColor:
                          carouselIndex === index
                            ? COLORS.primary
                            : `${COLORS.neutralGray}30`,
                        boxShadow:
                          carouselIndex === index
                            ? `0 0 15px ${COLORS.primary}50`
                            : "none",
                        transition: "all 0.3s ease",
                      }}
                    />
                  ),
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Global error banner ── */}
        {combinedError && (
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
              <p className="text-red-400 text-sm font-medium">
                {combinedError}
              </p>
            </div>
          </div>
        )}

        <motion.div className="mb-10">
          {/* 2. HEADER */}
          <div className="flex flex-col items-center text-center mb-12">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 px-6 py-2 rounded-full border border-white/10 bg-white/[0.03] backdrop-blur-xl mb-6 shadow-2xl"
            >
              <span className="text-[10px] font-black tracking-[0.5em] uppercase text-white/50">
                {content.badge}
              </span>
            </motion.div>
          </div>

          {/* 3. THE 3D CARD SPREAD */}
          <div className="flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-6 perspective-2000">
            {content.packages.map((pkg, i) => (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: i * 0.2 }}
                style={{ y: pkg.popular ? 0 : floatY }}
                className={`relative w-full max-w-[380px] group ${pkg.popular ? "z-40 scale-105 lg:scale-110" : "z-10"}`}
              >
                {/* Popular Badge */}
                {pkg.popular && pkg.label && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap">
                    <motion.div
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="px-5 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-[0.2em]  border border-white/10"
                      style={{
                        backgroundColor: COLORS.secondary,
                        color: COLORS.dark,
                      }}
                    >
                      {pkg.label}
                    </motion.div>
                  </div>
                )}

                {/* Card Container */}
                <div
                  className={`relative p-10 rounded-[3rem] border transition-all duration-700 h-full backdrop-blur-3xl overflow-hidden shadow-2xl ${pkg.popular
                    ? "border-primary/40 bg-white/[0.06]"
                    : "border-white/5 bg-white/[0.02] group-hover:bg-white/[0.04]"
                    } group-hover:border-primary/60`}
                >
                  {/* Background Alchemy Watermark */}
                  <span className="absolute -top-6 -right-6 text-[12rem] opacity-[0.03] text-white pointer-events-none italic group-hover:opacity-[0.06] transition-opacity duration-1000">
                    {SYMBOLS_LIST[i % SYMBOLS_LIST.length]}
                  </span>

                  {/* Header Content */}
                  <div className="relative z-10 mb-8">
                    <span
                      className="text-4xl mb-6"
                      style={{
                        color: pkg.popular ? COLORS.secondary : COLORS.primary,
                      }}
                    >
                      {SYMBOLS_LIST[i % SYMBOLS_LIST.length]}
                    </span>
                    <h3
                      style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}
                      className="text-2xl font-black text-white uppercase tracking-tighter mb-2"
                    >
                      {pkg.title}
                    </h3>
                    <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-5xl font-black text-white">
                        ${pkg.price}
                      </span>
                      <span className="text-white/20 text-xs uppercase tracking-widest font-light">
                        USD
                      </span>
                    </div>
                    <p className="text-white/50 text-xs leading-relaxed italic font-light h-8">
                      {pkg.tagline}
                    </p>
                  </div>

                  {/* Feature List */}
                  <div className="relative z-10 space-y-4 mb-10 border-t border-white/10 pt-8">
                    {pkg.features.map((feature, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 group/feat"
                      >
                        <Icon
                          icon="ph:sparkle-fill"
                          className="text-[10px] mt-1 transition-transform group-hover/feat:rotate-90"
                          style={{ color: COLORS.secondary }}
                        />
                        <span className="text-[11px] text-white/70 font-light tracking-wide group-hover/feat:text-white transition-colors">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Footer Quote */}
                  <p className="relative z-10 text-[10px] text-white/30 uppercase tracking-[0.2em] mb-10 leading-loose min-h-[40px]">
                    “{pkg.footer}”
                  </p>

                  {/* CTA Button */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() =>
                      handlePurchasePackage({
                        id: pkg.title,
                        points: pkg.points,
                        amount: 0,
                        price: parseFloat(pkg.price.replace("$", "")),
                        label: pkg.title,
                      })
                    }
                    className={`relative z-10 w-full py-3 rounded-2xl overflow-hidden uppercase transition-all duration-500 border
                                 ${pkg.popular
                        ? "bg-primary text-dark border-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]"
                        : "bg-transparent text-primary border-primary/50 hover:border-primary"
                      }
                               `}
                    style={{
                      // Using inline style only for the custom color variable if not in Tailwind config
                      backgroundColor: pkg.popular ? COLORS.primary : undefined,
                      color: pkg.popular ? COLORS.dark : COLORS.primary,
                      borderColor: COLORS.primary,
                    }}
                  >
                    {/* The "Liquid" fill effect for non-popular buttons */}
                    {!pkg.popular && (
                      <div className="absolute inset-0 bg-primary translate-y-[102%] group-hover/btn:translate-y-0 transition-transform duration-500 ease-out" />
                    )}

                    <span
                      className={`relative z-10 transition-colors duration-500 ${!pkg.popular && "group-hover/btn:text-dark"}`}
                    >
                      {pkg.cta}
                    </span>

                    {/* Subtle Glow Streak */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:animate-shimmer" />
                  </motion.button>
                </div>

                {/* Floor Aura for Deep Soul Access */}
                {pkg.id === 3 && (
                  <div className="absolute inset-0 -z-10 bg-primary/5 blur-[100px] rounded-full scale-75 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                )}
              </motion.div>
            ))}
          </div>

          {/* 4. FOOTER SYMBOLS */}
        </motion.div>

        {/* ── Transaction history ── */}
        <div
          className="relative mb-8 overflow-hidden rounded-[28px] border border-white/10 p-5 backdrop-blur-xl sm:mb-12 sm:p-8 md:p-10"
          style={{
            background: `linear-gradient(180deg, ${COLORS.surface}e8 0%, ${COLORS.dark}d8 100%)`,
            boxShadow: "0 22px 70px rgba(0,0,0,0.34)",
          }}
        >
          {/* Section header */}
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-3 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                <Icon
                  icon="solar:history-bold-duotone"
                  style={{ color: COLORS.primary }}
                  className="text-base"
                />
                <span className="text-[9px] font-black uppercase tracking-[0.24em] text-white/45">
                  Ledger
                </span>
              </div>
              <h2
                className="text-3xl font-black uppercase tracking-normal sm:text-4xl"
                style={{ color: COLORS.neutralWhite }}
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
                  style={{ color: COLORS.primary }}
                >
                  {transactionsData?.total ?? 0} Total
                </span>
              </div>
            )}
          </div>

          {/* Loading state */}
          {combinedLoading && transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Icon
                icon="svg-spinners:3-dots-fade"
                className="text-5xl mb-4"
                style={{ color: COLORS.primary }}
              />
              <p
                className="text-sm opacity-50"
                style={{ color: COLORS.neutralGray }}
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
                style={{ color: COLORS.neutralGray }}
              />
              <h3
                className="text-lg sm:text-xl font-black uppercase mb-2"
                style={{ color: COLORS.neutralGray }}
              >
                No Transactions Yet
              </h3>
              <p
                className="text-xs sm:text-sm opacity-50"
                style={{ color: COLORS.neutralGray }}
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
                  const isCredit =
                    transaction.transaction_type === TransactionType.CREDIT;

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
                                style={{ color: COLORS.neutralGray }}
                              >
                                <Icon
                                  icon="solar:calendar-bold-duotone"
                                  className="text-xs sm:text-sm"
                                />
                                {formatDate(transaction.created_at)}
                              </span>
                              <span
                                className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider opacity-40 flex items-center gap-1"
                                style={{ color: COLORS.neutralGray }}
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
                            style={{ color: COLORS.neutralGray }}
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
                  style={{ backgroundColor: `${COLORS.surface}80` }}
                >
                  <div
                    className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider opacity-60 text-center md:text-left"
                    style={{ color: COLORS.neutralGray }}
                  >
                    Page {currentPage} of {transactionsData.pages} •{" "}
                    {transactionsData.total} transactions
                  </div>

                  <div
                    className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-xl sm:rounded-2xl border backdrop-blur-xl"
                    style={{
                      backgroundColor: `${COLORS.dark}cc`,
                      borderColor: `${COLORS.primary}20`,
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
                        style={{ color: COLORS.primary }}
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
                                  style={{ color: COLORS.neutralGray }}
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
                                      ? COLORS.primary
                                      : "transparent",
                                  color:
                                    currentPage === page
                                      ? COLORS.dark
                                      : COLORS.neutralGray,
                                  borderColor:
                                    currentPage === page
                                      ? COLORS.primary
                                      : "transparent",
                                  boxShadow:
                                    currentPage === page
                                      ? `0 0 20px ${COLORS.primary}40`
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
                        style={{ color: COLORS.primary }}
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
              backgroundColor: `${COLORS.surface}dd`,
              borderColor: `${COLORS.primary}60`,
              boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 80px ${COLORS.primary}30`,
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
                    backgroundColor: COLORS.primary,
                    opacity: 0.3,
                  }}
                />
              ))}
            </div>

            <div className="text-center relative z-10">
              <div
                className="w-20 h-20 sm:w-28 sm:h-28 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 relative"
                style={{
                  backgroundColor: `${COLORS.primary}20`,
                  border: `3px solid ${COLORS.primary}40`,
                }}
              >
                <Icon
                  icon="solar:check-circle-bold-duotone"
                  className="text-7xl"
                  style={{ color: COLORS.primary }}
                />
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    border: `2px solid ${COLORS.primary}`,
                    opacity: 0.5,
                  }}
                />
              </div>

              <h2
                className="text-3xl sm:text-4xl md:text-5xl font-black uppercase mb-3 sm:mb-4"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Success!
              </h2>
              <p
                className="text-sm sm:text-base mb-6 sm:mb-8 font-light px-2"
                style={{ color: COLORS.neutralGray }}
              >
                Your top-up was successful! Your points have been added to your
                account.
              </p>

              <button
                onClick={closeSuccessModal}
                className="w-full py-3 sm:py-4 rounded-2xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all relative overflow-hidden group"
                style={{
                  backgroundColor: COLORS.primary,
                  color: COLORS.dark,
                  boxShadow: `0 10px 40px ${COLORS.primary}40`,
                }}
              >
                <span className="relative z-10">Continue</span>
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
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
              backgroundColor: `${COLORS.surface}dd`,
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
                style={{ color: COLORS.neutralGray }}
              >
                Your payment could not be processed. Please try again or contact
                support if the issue persists.
              </p>

              <button
                onClick={closeErrorModal}
                className="w-full py-3 sm:py-4 rounded-2xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all relative overflow-hidden group"
                style={{
                  backgroundColor: "#F87171",
                  color: COLORS.dark,
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

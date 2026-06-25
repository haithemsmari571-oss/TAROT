import { useState, useEffect, useRef, useMemo } from "react";
import { Icon } from "@iconify/react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { usePayment } from "../hooks/usePayment";
import type { PointsPackage } from "../types/payment.types";
import type { BuyOption } from "../../buy-options/types/buyOptions.types";
import { buyOptionsApi } from "../../buy-options/api/buyOptionsApi";
import { TransactionStatus, TransactionType, type Transaction } from "../../ledger/types/transaction.types";

// ─── Constellation data for background patterns ──────────────────────────────
const CONSTELLATION_DATA = [
  {
    name: "Ursa Major",
    path: "M10,40 L30,35 L45,45 L60,45 L75,30 L90,35 L75,60 L60,45",
    stars: [[10,40],[30,35],[45,45],[60,45],[75,30],[90,35],[75,60]] as [number,number][],
  },
  {
    name: "Orion",
    path: "M20,10 L50,30 L80,10 M50,30 L45,50 L55,50 M45,50 L20,90 M55,50 L80,90",
    stars: [[20,10],[50,30],[80,10],[45,50],[55,50],[20,90],[80,90]] as [number,number][],
  },
  {
    name: "Cassiopeia",
    path: "M10,20 L30,50 L50,30 L70,60 L90,40",
    stars: [[10,20],[30,50],[50,30],[70,60],[90,40]] as [number,number][],
  },
];

// ─── Helper: transaction type display config ──────────────────────────────────
const getTypeDisplay = (type: any) => {
  switch (type) {
    case TransactionType.CREDIT:
    case "CREDIT":
      return { icon: "solar:arrow-down-bold-duotone", color: "#4ADE80", label: "Credit" };
    case TransactionType.DEBIT:
    case "DEBIT":
      return { icon: "solar:arrow-up-bold-duotone", color: "#F87171", label: "Debit" };
    default:
      return { icon: "solar:transfer-horizontal-bold-duotone", color: "#94A3B8", label: "Transfer" };
  }
};

// ─── Helper: transaction status display config ────────────────────────────────
const getStatusDisplay = (status: any) => {
  switch (status) {
    case TransactionStatus.COMPLETED:
    case "COMPLETED":
      return { color: "#4ADE80", label: "Completed" };
    case TransactionStatus.PENDING:
    case "PENDING":
      return { color: "#FBBF24", label: "Pending" };
    case TransactionStatus.FAILED:
    case "FAILED":
      return { color: "#F87171", label: "Failed" };
    case TransactionStatus.REVERSED:
    case "REVERSED":
      return { color: "#94A3B8", label: "Reversed" };
    default:
      return { color: "#94A3B8", label: String(status) };
  }
};

// ─── Helper: format date ──────────────────────────────────────────────────────
const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
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
    unitPrice,
    createCheckoutSession,
    fetchMyTransactions,
    fetchMyBalance,
    fetchUnitPrice,
  } = usePayment();

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPackage, setSelectedPackage] = useState<PointsPackage | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [cardsPerView, setCardsPerView] = useState(3);

  // Buy options API state
  const [apiPackages, setApiPackages] = useState<BuyOption[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Canvas & refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const carouselContainerRef = useRef<HTMLDivElement>(null);
  const [windowSize, setWindowSize] = useState({ width: 1920, height: 1080 });

  // ─── Fetch buy options from API ─────────────────────────────────────────────
  useEffect(() => {
    const fetchApiOptions = async () => {
      try {
        setApiLoading(true);
        setApiError(null);
        const data = await buyOptionsApi.getBuyOptions();
        const activeOptions = data
          .filter((opt) => opt.is_active)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        setApiPackages(activeOptions);
      } catch (err: any) {
        const msg = err.response?.data?.message || err.message || "Failed to load point offers.";
        setApiError(msg);
      } finally {
        setApiLoading(false);
      }
    };
    fetchApiOptions();
  }, []);

  // ─── Build packages list ────────────────────────────────────────────────────
  const pointsPackages: PointsPackage[] = useMemo(() => {
    const pricePerPoint = unitPrice?.unit_price_cents || 10;
    if (apiPackages.length > 0) {
      return apiPackages.map((opt) => ({
        points: opt.points,
        price: (opt as any).price_cents ?? opt.points * pricePerPoint,
        label: opt.label,
      }));
    }
    return [
      { points: 5,   price: pricePerPoint * 5,  label: "Starter" },
      { points: 20,  price: pricePerPoint * 20, label: "Basic" },
      { points: 50,  price: pricePerPoint * 50, label: "Popular" },
      { points: 100, price: pricePerPoint * 100, label: "Pro" },
      { points: 250, price: pricePerPoint * 250, label: "Premium" },
      { points: 500, price: pricePerPoint * 500, label: "Elite" },
    ];
  }, [unitPrice, apiPackages]);

  // ─── Stable constellation data (no random on re-render) ────────────────────
  const constellations = useMemo(() => {
    return Array.from({ length: 6 }).map((_, i) => {
      const data = CONSTELLATION_DATA[i % CONSTELLATION_DATA.length];
      return {
        ...data,
        x: (i * 17 + 5) % 90,
        y: (i * 23 + 10) % 90,
        scale: 0.6 + (i * 0.15) % 0.8,
        rotate: (i * 60) % 360,
        opacity: 0.05 + (i * 0.025) % 0.15,
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
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount / 100);

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    navigate(window.location.pathname, { replace: true });
  };

  const closeErrorModal = () => {
    setShowErrorModal(false);
    navigate(window.location.pathname, { replace: true });
  };

  const handlePurchase = async (pkg: PointsPackage) => {
    setSelectedPackage(pkg);
    try {
      const returnUrl = searchParams.get("return_url");
      await createCheckoutSession({
        points_amount: pkg.points,
        return_url: returnUrl || undefined,
      });
    } catch (err) {
      console.error("Failed to create checkout session:", err);
    }
  };

  // ─── Derived state ───────────────────────────────────────────────────────────
  const transactions = transactionsData?.transactions || [];
  const totalPages = Math.ceil((transactionsData?.total || 0) / 10);
  const combinedLoading = paymentLoading || apiLoading;
  const combinedError = paymentError || apiError;
  const maxCarouselIndex = Math.max(0, Math.ceil(pointsPackages.length / cardsPerView) - 1);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative p-8 md:p-12 min-h-screen pt-32 overflow-hidden"
      style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}
    >
      {/* ── Animated star canvas ── */}
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none opacity-40 z-0" />

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
          background: `radial-gradient(circle at 50% 20%, transparent 0%, ${COLORS.dark}cc 70%, ${COLORS.dark} 100%)`,
        }}
      />

      {/* ── Page content ── */}
      <div className="relative z-10">

        {/* ── Header ── */}
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-2 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-3xl mb-6 bg-white/5 max-w-fit mx-auto">
            <Icon icon="solar:wallet-money-bold-duotone" className="text-lg" style={{ color: COLORS.primary }} />
            <span className="uppercase tracking-[0.4em] text-[9px] text-white/80">Billing Dashboard</span>
          </div>

          <h1
            className="text-3xl sm:text-5xl md:text-7xl font-black uppercase tracking-tighter mb-4"
            style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }}
          >
            Top Up{" "}
            <span
              style={{
                background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Points
            </span>
          </h1>
          <p style={{ color: COLORS.neutralGray }} className="text-sm font-light tracking-wide max-w-2xl mx-auto">
            Purchase points for psychic readings and manage your transaction history
          </p>
        </div>

        {/* ── Balance card ── */}
        <div
          className="p-6 sm:p-8 md:p-12 rounded-[40px] border border-white/10 mb-8 sm:mb-16 relative overflow-hidden backdrop-blur-xl max-w-5xl mx-auto"
          style={{
            background: `linear-gradient(135deg, ${COLORS.surface}dd 0%, ${COLORS.surfaceAccent}dd 100%)`,
            boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 80px ${COLORS.primary}10`,
          }}
        >
          <div className="absolute -top-20 -right-20 w-80 h-80 opacity-5 pointer-events-none">
            <Icon icon="solar:wallet-money-bold-duotone" className="w-full h-full" style={{ color: COLORS.primary }} />
          </div>

          <div className="relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-center">
              {/* Balance amount */}
              <div>
                <div
                  className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 flex items-center gap-2"
                  style={{ color: COLORS.neutralGray }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.primary }} />
                  Current Balance
                </div>
                <div className="flex items-end gap-3 sm:gap-4 mb-3 flex-wrap">
                  <div
                    className="text-5xl sm:text-7xl md:text-8xl font-black"
                    style={{
                      background: `linear-gradient(135deg, ${COLORS.neutralWhite} 0%, ${COLORS.primary} 100%)`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {balance?.balance?.toLocaleString() ?? "0"}
                  </div>
                  <div className="text-3xl font-black mb-3 uppercase" style={{ color: COLORS.primary }}>
                    Points
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div
                  className="p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center"
                  style={{ backgroundColor: `${COLORS.dark}80` }}
                >
                  <Icon icon="solar:chart-square-bold-duotone" className="text-3xl mb-2" style={{ color: COLORS.secondary }} />
                  <div className="text-2xl font-black text-white mb-1">{transactionsData?.total ?? 0}</div>
                  <div className="text-[8px] uppercase tracking-wider opacity-60" style={{ color: COLORS.neutralGray }}>
                    Total Transactions
                  </div>
                </div>
                <div
                  className="p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center"
                  style={{ backgroundColor: `${COLORS.dark}80` }}
                >
                  <Icon icon="solar:shield-check-bold-duotone" className="text-3xl mb-2" style={{ color: COLORS.starGold }} />
                  <div className="text-2xl font-black text-white mb-1">Active</div>
                  <div className="text-[8px] uppercase tracking-wider opacity-60" style={{ color: COLORS.neutralGray }}>
                    Account Status
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Buy Points carousel ── */}
        <div
          className="mb-8 sm:mb-16 relative overflow-hidden rounded-[24px] sm:rounded-[40px] p-6 sm:p-10 md:p-16 backdrop-blur-xl border border-white/5"
          style={{ backgroundColor: `${COLORS.surface}dd`, boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}
        >
          <div className="absolute inset-0 opacity-5 overflow-hidden pointer-events-none">
            <div className="absolute top-0 right-0 w-96 h-96">
              <Icon icon="solar:wallet-money-bold-duotone" className="w-full h-full" style={{ color: COLORS.primary }} />
            </div>
          </div>

          <div className="relative z-10">
            <h2
              className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight mb-3 flex items-center justify-center gap-3"
              style={{ color: COLORS.neutralWhite }}
            >
              <Icon icon="solar:bag-smile-bold-duotone" style={{ color: COLORS.primary }} className="text-2xl sm:text-4xl" />
              Buy Points
            </h2>
            <p className="text-center text-sm mb-10 opacity-60" style={{ color: COLORS.neutralGray }}>
              Choose the perfect package for your spiritual journey
            </p>

            {/* Cards */}
            <div className="overflow-hidden" ref={carouselContainerRef}>
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${carouselIndex * (100 / cardsPerView)}%)` }}
              >
                {pointsPackages.map((pkg, idx) => {
                  const sourceApiPkg = apiPackages.find(opt => opt.label === pkg.label && opt.points === pkg.points);
                  const isSelected = selectedPackage?.label === pkg.label;
                  const isProcessing = combinedLoading && isSelected;
                  const paddingStyle =
                    idx === 0
                      ? "0 0.75rem 0 0"
                      : idx === pointsPackages.length - 1
                      ? "0 0 0 0.75rem"
                      : "0 0.75rem";

                  return (
                    <div
                      key={`${pkg.label}-${idx}`}
                      className="flex-shrink-0"
                      style={{ width: `${100 / cardsPerView}%`, padding: paddingStyle }}
                    >
                      <div
                        className={`p-6 sm:p-8 md:p-10 rounded-[20px] sm:rounded-[28px] cursor-pointer relative overflow-hidden group flex flex-col h-full transition-all duration-300 ${
                          isSelected ? "border-2" : "border border-white/10"
                        }`}
                        style={{
                          backgroundColor: `${COLORS.surface}80`,
                          backdropFilter: "blur(20px)",
                          borderColor: isSelected ? COLORS.primary : "rgba(255,255,255,0.05)",
                          boxShadow: isSelected
                            ? `0 0 40px ${COLORS.primary}30, 0 20px 50px rgba(0,0,0,0.5)`
                            : "0 10px 30px rgba(0,0,0,0.3)",
                          minHeight: "420px",
                        }}
                        onClick={() => setSelectedPackage(pkg)}
                      >
                        {/* Hover gradient */}
                        <div
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                          style={{ background: `radial-gradient(circle at 50% 0%, ${COLORS.primary}15 0%, transparent 70%)` }}
                        />

                        <div className="relative z-10 flex flex-col h-full">
                          {/* Label badge */}
                          <div className="flex items-start justify-between gap-3 mb-6">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm border-2 transition-all group-hover:scale-110"
                                style={{
                                  backgroundColor: `${COLORS.primary}15`,
                                  borderColor: `${COLORS.primary}40`,
                                  color: COLORS.primary,
                                }}
                              >
                                {pkg.label.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-white font-bold leading-tight text-sm">
                                  {pkg.label}
                                </span>
                                {sourceApiPkg?.sort_order !== undefined && (
                                  <span
                                    style={{ color: COLORS.neutralGray, fontSize: "9px" }}
                                    className="uppercase font-black tracking-widest opacity-40 mt-0.5"
                                  >
                                    Tier Position: {sourceApiPkg.sort_order}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 bg-[#4ADE80]/10 px-2.5 py-1 rounded-full border border-[#4ADE80]/20">
                              <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{
                                  backgroundColor: "#4ADE80",
                                  boxShadow: "0 0 8px #4ADE80",
                                }}
                              />
                              <span className="text-[8px] font-black uppercase tracking-widest text-[#4ADE80]">
                                Verified
                              </span>
                            </div>
                          </div>

                          {/* Points amount */}
                          <div className="mb-6 sm:mb-8">
                            <div
                              className="text-4xl sm:text-6xl md:text-7xl font-black mb-1 tracking-tight"
                              style={{
                                background: `linear-gradient(135deg, ${COLORS.neutralWhite} 0%, ${COLORS.primary} 100%)`,
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                backgroundClip: "text",
                              }}
                            >
                              {pkg.points.toLocaleString()}
                            </div>
                            <div className="text-[10px] font-black uppercase tracking-widest opacity-50" style={{ color: COLORS.neutralGray }}>
                              Tokens Loaded
                            </div>
                          </div>

                          {/* Price */}
                          <div className="mt-auto">
                            <div className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-1" style={{ color: COLORS.neutralGray }}>
                              One-Time Charge
                            </div>
                            <div className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight" style={{ color: COLORS.primary }}>
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
                            className="w-full px-4 sm:px-6 py-4 sm:py-5 rounded-2xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group/btn mt-6 sm:mt-8"
                            style={{
                              backgroundColor: COLORS.primary,
                              color: COLORS.dark,
                              boxShadow: `0 10px 30px ${COLORS.primary}30`,
                              fontFamily: TYPOGRAPHY.fontFamily.heading,
                            }}
                          >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                              {isProcessing ? (
                                <>
                                  <Icon icon="svg-spinners:3-dots-fade" className="text-base" />
                                  Securing Session…
                                </>
                              ) : (
                                <>
                                  Proceed to Payment
                                  <Icon icon="solar:arrow-right-linear" className="text-sm group-hover/btn:translate-x-1 transition-transform" />
                                </>
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
            <div className="flex items-center justify-center gap-6 mt-10">
              <button
                onClick={() => setCarouselIndex((i) => Math.max(0, i - 1))}
                disabled={carouselIndex === 0}
                className="w-14 h-14 rounded-2xl border flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed backdrop-blur-xl"
                style={{
                  backgroundColor: `${COLORS.dark}dd`,
                  borderColor: COLORS.primary,
                  boxShadow: `0 5px 20px ${COLORS.primary}20`,
                }}
              >
                <Icon icon="ph:caret-left-bold" className="text-2xl" style={{ color: COLORS.primary }} />
              </button>

              <div className="flex gap-2">
                {Array.from({ length: maxCarouselIndex + 1 }).map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCarouselIndex(index)}
                    style={{
                      width: carouselIndex === index ? "40px" : "10px",
                      height: "10px",
                      borderRadius: "5px",
                      backgroundColor: carouselIndex === index ? COLORS.primary : `${COLORS.neutralGray}30`,
                      boxShadow: carouselIndex === index ? `0 0 15px ${COLORS.primary}50` : "none",
                      transition: "all 0.3s ease",
                    }}
                  />
                ))}
              </div>

              <button
                onClick={() => setCarouselIndex((i) => Math.min(maxCarouselIndex, i + 1))}
                disabled={carouselIndex >= maxCarouselIndex}
                className="w-14 h-14 rounded-2xl border flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed backdrop-blur-xl"
                style={{
                  backgroundColor: `${COLORS.dark}dd`,
                  borderColor: COLORS.primary,
                  boxShadow: `0 5px 20px ${COLORS.primary}20`,
                }}
              >
                <Icon icon="ph:caret-right-bold" className="text-2xl" style={{ color: COLORS.primary }} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Global error banner ── */}
        {combinedError && (
          <div
            className="p-6 rounded-3xl border border-red-500/20 mb-8 backdrop-blur-xl"
            style={{ backgroundColor: "rgba(248, 113, 113, 0.1)" }}
          >
            <div className="flex items-center gap-3">
              <Icon icon="solar:danger-circle-bold-duotone" className="text-3xl text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm font-medium">{combinedError}</p>
            </div>
          </div>
        )}

        {/* ── Transaction History Section ── */}
        <div
          className="rounded-[40px] border border-white/5 p-6 sm:p-10 md:p-12 backdrop-blur-xl max-w-5xl mx-auto mb-12"
          style={{
            backgroundColor: `${COLORS.surface}dd`,
            boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                <Icon icon="solar:history-bold-duotone" style={{ color: COLORS.primary }} />
                Transaction Ledger
              </h2>
              <p style={{ color: COLORS.neutralGray }} className="text-xs opacity-60 mt-1">
                Real-time chronological record of point transfers and billing purchases
              </p>
            </div>
            
            {/* Minimal Items Counter Badge */}
            <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-medium text-white/80 self-start sm:self-center">
              Total logs: <span style={{ color: COLORS.primary }} className="font-bold">{transactionsData?.total || 0}</span>
            </div>
          </div>

          {/* Transactions List */}
          {paymentLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 opacity-60">
              <Icon icon="svg-spinners:ring-resize" className="text-4xl" style={{ color: COLORS.primary }} />
              <span className="text-xs uppercase tracking-widest text-neutral-400 font-bold">Syncing Records...</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
              <Icon icon="solar:folder-empty-bold-duotone" className="text-5xl mx-auto mb-3 opacity-20" style={{ color: COLORS.neutralGray }} />
              <p className="text-sm text-white/40 font-medium">No transaction records found on this account</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx: Transaction) => {
                // Typecasted safely to bypass schema discrepancies safely at build time
                const rawTx = tx as any;
                const txType = rawTx.type || rawTx.action || "";
                const txAmount = rawTx.points_amount ?? rawTx.pointsAmount ?? rawTx.amount ?? 0;
                const txStatus = rawTx.status || "";
                const txDescription = rawTx.description || "";
                const txDate = rawTx.created_at || rawTx.createdAt || "";

                const typeConfig = getTypeDisplay(txType);
                const statusConfig = getStatusDisplay(txStatus);

                return (
                  <div
                    key={rawTx.id || Math.random().toString()}
                    className="p-4 rounded-2xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:bg-white/[0.02] bg-white/[0.01]"
                  >
                    <div className="flex items-center gap-4">
                      {/* Type Icon Layout */}
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center border"
                        style={{
                          backgroundColor: `${typeConfig.color}10`,
                          borderColor: `${typeConfig.color}20`,
                        }}
                      >
                        <Icon icon={typeConfig.icon} className="text-xl" style={{ color: typeConfig.color }} />
                      </div>

                      {/* Title description system */}
                      <div>
                        <h4 className="text-sm font-bold text-white tracking-wide">
                          {txDescription || `${typeConfig.label} Adjustment`}
                        </h4>
                        <span className="text-[11px] block mt-0.5" style={{ color: COLORS.neutralGray }}>
                          {formatDate(txDate)}
                        </span>
                      </div>
                    </div>

                    <div className="flex sm:items-center justify-between sm:justify-end gap-6 border-t border-white/5 sm:border-0 pt-3 sm:pt-0">
                      {/* Status pill tag indicator */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                           style={{ backgroundColor: `${statusConfig.color}10`, border: `1px solid ${statusConfig.color}20`, color: statusConfig.color }}>
                        <div className="w-1 h-1 rounded-full" style={{ backgroundColor: statusConfig.color }} />
                        {statusConfig.label}
                      </div>

                      {/* Points mutation delta amount display */}
                      <div className="text-right">
                        <span className="text-base font-black tracking-tight" style={{ color: typeConfig.color }}>
                          {txType === TransactionType.CREDIT || String(txType).toUpperCase() === "CREDIT" ? "+" : "-"}{txAmount.toLocaleString()}
                        </span>
                        <span className="text-[9px] block font-bold uppercase tracking-widest opacity-40" style={{ color: COLORS.neutralGray }}>
                          PTS
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Minimal Pagination Navigation footer row */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-white/5 pt-6 mt-6">
                  <button
                    disabled={currentPage === 1 || paymentLoading}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 text-white transition-all disabled:opacity-20 disabled:cursor-not-allowed bg-white/5 hover:bg-white/10"
                  >
                    <Icon icon="ph:arrow-left-bold" />
                    Prev
                  </button>
                  <span className="text-xs font-medium" style={{ color: COLORS.neutralGray }}>
                    Page <span className="text-white font-bold">{currentPage}</span> of {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages || paymentLoading}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 text-white transition-all disabled:opacity-20 disabled:cursor-not-allowed bg-white/5 hover:bg-white/10"
                  >
                    Next
                    <Icon icon="ph:arrow-right-bold" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Billing;
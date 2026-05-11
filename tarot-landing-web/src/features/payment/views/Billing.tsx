import { useState, useEffect, useRef, useMemo } from "react";
import { Icon } from "@iconify/react";
import { useSearchParams, useNavigate } from "react-router-dom";
// framer-motion removed for performance
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { usePayment } from "../hooks/usePayment";
import { TransactionType, TransactionStatus } from "@/features/ledger/types/transaction.types";
import type { Transaction } from "@/features/ledger/types/transaction.types";
import type { PointsPackage } from "../types/payment.types";

// Constellation data for background patterns (from hero section)
const CONSTELLATION_DATA = [
  {
    name: "Ursa Major",
    path: "M10,40 L30,35 L45,45 L60,45 L75,30 L90,35 L75,60 L60,45",
    stars: [[10,40], [30,35], [45,45], [60,45], [75,30], [90,35], [75,60]]
  },
  {
    name: "Orion",
    path: "M20,10 L50,30 L80,10 M50,30 L45,50 L55,50 M45,50 L20,90 M55,50 L80,90",
    stars: [[20,10], [50,30], [80,10], [45,50], [55,50], [20,90], [80,90]]
  },
  {
    name: "Cassiopeia",
    path: "M10,20 L30,50 L50,30 L70,60 L90,40",
    stars: [[10,20], [30,50], [50,30], [70,60], [90,40]]
  }
];

const Billing = () => {
  const { 
    loading, 
    error, 
    transactions: transactionsData, 
    balance,
    unitPrice,
    createCheckoutSession,
    fetchMyTransactions,
    fetchMyBalance,
    fetchUnitPrice 
  } = usePayment();

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPackage, setSelectedPackage] = useState<PointsPackage | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [cardsPerView, setCardsPerView] = useState(3);
  
  // Canvas and animation refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [windowSize, setWindowSize] = useState({ width: 1920, height: 1080 });
  
  // Mouse tracking for parallax effects
  // motion values removed

  // Constellation patterns for background
  const constellations = useMemo(() => {
    return Array.from({ length: 6 }).map((_, i) => {
      const data = CONSTELLATION_DATA[i % CONSTELLATION_DATA.length];
      return {
        ...data,
        x: Math.random() * 90,
        y: Math.random() * 90,
        scale: 0.6 + Math.random() * 0.8,
        rotate: Math.random() * 360,
        opacity: 0.05 + Math.random() * 0.15
      };
    });
  }, []);

  // mouse move handler removed

  // Update cards per view and canvas size
  useEffect(() => {
    const updateCardsPerView = () => {
      if (window.innerWidth < 768) {
        setCardsPerView(1);
      } else if (window.innerWidth < 1024) {
        setCardsPerView(2);
      } else {
        setCardsPerView(3);
      }
    };
    
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
      updateCardsPerView();
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Animated stars background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    let animationFrameId: number;
    let stars = Array.from({ length: 150 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 1.5,
      opacity: Math.random(),
      pulse: 0.008 + Math.random() * 0.015
    }));

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(s => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
        ctx.fill();
        s.opacity += s.pulse;
        if (s.opacity > 0.8 || s.opacity < 0.2) s.pulse *= -1;
      });
      animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [windowSize]);

  // Check for status in URL
  useEffect(() => {
    const status = searchParams.get('status');
    if (status === 'success') {
      setShowSuccessModal(true);
      // Refresh balance after successful payment
      fetchMyBalance();
      fetchMyTransactions({ page: 1, limit: 10 });
    } else if (status === 'error') {
      setShowErrorModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Define points packages dynamically based on unit price
  const pointsPackages: PointsPackage[] = useMemo(() => {
    const pricePerPoint = unitPrice?.unit_price_cents || 10; // Default to 10 cents if not loaded
    
    return [
      {
        points: 5,
        price: pricePerPoint * 5,
        label: "Starter",
      },
      {
        points: 20,
        price: pricePerPoint * 20,
        label: "Basic",
      },
      {
        points: 50,
        price: pricePerPoint * 50,
        label: "Popular",
      },
      {
        points: 100,
        price: pricePerPoint * 100,
        label: "Pro",
      },
      {
        points: 250,
        price: pricePerPoint * 250,
        label: "Premium",
      },
      {
        points: 500,
        price: pricePerPoint * 500,
        label: "Elite",
      },
    ];
  }, [unitPrice]);

  // Fetch data on component mount
  useEffect(() => {
    fetchUnitPrice();
    fetchMyBalance();
    fetchMyTransactions({ page: currentPage, limit: 10 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // Close modal and clear URL params
  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    navigate('/billing', { replace: true });
  };

  const closeErrorModal = () => {
    setShowErrorModal(false);
    navigate('/billing', { replace: true });
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount / 100);
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // Get transaction type icon and color
  const getTypeDisplay = (type: TransactionType) => {
    switch (type) {
      case TransactionType.CREDIT:
        return {
          icon: "solar:card-receive-bold-duotone",
          color: "#4ADE80",
          label: "Credit",
        };
      case TransactionType.DEBIT:
        return {
          icon: "solar:card-send-bold-duotone",
          color: "#F87171",
          label: "Debit",
        };
      case TransactionType.REFUND:
        return {
          icon: "solar:restart-bold-duotone",
          color: COLORS.starGold,
          label: "Refund",
        };
      case TransactionType.REVERSAL:
        return {
          icon: "solar:undo-left-bold-duotone",
          color: COLORS.secondary,
          label: "Reversal",
        };
    }
  };

  // Get status display
  const getStatusDisplay = (status: TransactionStatus) => {
    switch (status) {
      case TransactionStatus.COMPLETED:
        return { color: "#4ADE80", label: "Completed" };
      case TransactionStatus.PENDING:
        return { color: COLORS.starGold, label: "Pending" };
      case TransactionStatus.FAILED:
        return { color: "#F87171", label: "Failed" };
      case TransactionStatus.REVERSED:
        return { color: COLORS.secondary, label: "Reversed" };
    }
  };

  // Handle package purchase
  const handlePurchase = async (pkg: PointsPackage) => {
    try {
      // Get return URL from query params if present
      const returnUrl = searchParams.get('return_url');
      
      await createCheckoutSession({ 
        points_amount: pkg.points,
        return_url: returnUrl || undefined
      });
    } catch (err) {
      console.error("Failed to create checkout session:", err);
    }
  };

  const transactions = transactionsData?.transactions || [];

  return (
    <div
      className="relative p-8 md:p-12 min-h-screen pt-32 overflow-hidden"
      
      style={{
        backgroundColor: COLORS.dark,
        fontFamily: TYPOGRAPHY.fontFamily.body,
      }}
    >
      {/* Animated stars canvas background */}
      <canvas 
        ref={canvasRef} 
        className="fixed inset-0 pointer-events-none opacity-40 z-0" 
      />

      {/* Constellation patterns layer */}
      <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden">
        {constellations.map((con, i) => (
          <svg
            key={`con-${i}`}
            viewBox="0 0 100 100"
            style={{
              position: 'absolute',
              left: `${con.x}%`,
              top: `${con.y}%`,
              width: '250px',
              height: '250px',
              rotate: con.rotate,
              scale: con.scale,

              opacity: con.opacity
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
                
                
                
                style={{ filter: 'drop-shadow(0 0 2px white)' }}
              />
            ))}
          </svg>
        ))}
      </div>

      {/* Radial gradient overlay for depth */}
      <div 
        className="fixed inset-0 z-[2] pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 20%, transparent 0%, ${COLORS.dark}cc 70%, ${COLORS.dark} 100%)`,
        }}
      />

      {/* Main content */}
      <div className="relative z-10">
        {/* Header */}
        <div 
          className="mb-12 text-center"
          
          
          
        >
          <div 
            className="flex items-center justify-center gap-2 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-3xl mb-6 bg-white/5 max-w-fit mx-auto"
            
          >
            <Icon 
              icon="solar:wallet-money-bold-duotone" 
              className="text-lg"
              style={{ color: COLORS.primary }}
            />
            <span className="uppercase tracking-[0.4em] text-[9px] text-white/80">
              Billing Dashboard
            </span>
          </div>
          
          <h1
            className="text-3xl sm:text-5xl md:text-7xl font-black uppercase tracking-tighter mb-4"
            style={{ 
              fontFamily: TYPOGRAPHY.fontFamily.heading,
              color: COLORS.neutralWhite
            }}
          >
            Top Up{" "}
            <span 
              className="inline-block"
              style={{
                background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
                WebkitBackgroundClip: 'text', 
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Points
            </span>
          </h1>
          <p
            style={{ color: COLORS.neutralGray }}
            className="text-sm font-light tracking-wide max-w-2xl mx-auto"
          >
            Purchase points for psychic readings and manage your transaction history
          </p>
        </div>

        {/* Balance Card - Enhanced Design */}
        <div
          className="p-6 sm:p-8 md:p-12 rounded-[40px] border border-white/10 mb-8 sm:mb-16 relative overflow-hidden backdrop-blur-xl max-w-5xl mx-auto"
          
          
          
          style={{
            background: `linear-gradient(135deg, ${COLORS.surface}dd 0%, ${COLORS.surfaceAccent}dd 100%)`,
            boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 80px ${COLORS.primary}10`
          }}
          
        >
          {/* Animated background icon */}
          <div 
            className="absolute -top-20 -right-20 w-80 h-80 opacity-5"
            
            
          >
            <Icon
              icon="solar:wallet-money-bold-duotone"
              className="w-full h-full"
              style={{ color: COLORS.primary }}
            />
          </div>

          {/* Floating particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  backgroundColor: COLORS.primary,
                  opacity: 0.3
                }}
                
                
              />
            ))}
          </div>
          
          <div className="relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-center">
              <div>
                <div
                  className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 flex items-center gap-2"
                  style={{ color: COLORS.neutralGray }}
                >
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: COLORS.primary }}
                  />
                  Current Balance
                </div>
                <div className="flex items-end gap-3 sm:gap-4 mb-3 flex-wrap">
                  <div 
                    className="text-5xl sm:text-7xl md:text-8xl font-black"
                    style={{
                      background: `linear-gradient(135deg, ${COLORS.neutralWhite} 0%, ${COLORS.primary} 100%)`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                    
                    
                    
                  >
                    {balance?.balance?.toLocaleString() || "0"}
                  </div>
                  <div
                    className="text-3xl font-black mb-3 uppercase"
                    style={{ color: COLORS.primary }}
                  >
                    Points
                  </div>
                </div>
                <div
                  className="text-[10px] font-medium uppercase tracking-wider opacity-60"
                  style={{ color: COLORS.neutralGray }}
                >
                  Available for psychic readings
                </div>
              </div>

               {/* Quick stats */}
               <div className="grid grid-cols-2 gap-3 sm:gap-4">
                 <div 
                   className="p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center"
                   style={{ backgroundColor: `${COLORS.dark}80` }}
                 >
                   <Icon 
                     icon="solar:chart-square-bold-duotone" 
                     className="text-3xl mb-2"
                     style={{ color: COLORS.secondary }}
                   />
                   <div className="text-2xl font-black text-white mb-1">
                     {transactionsData?.total || 0}
                   </div>
                   <div 
                     className="text-[8px] uppercase tracking-wider opacity-60"
                     style={{ color: COLORS.neutralGray }}
                   >
                     Total Transactions
                   </div>
                 </div>

                 <div 
                   className="p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center"
                   style={{ backgroundColor: `${COLORS.dark}80` }}
                 >
                   <Icon 
                     icon="solar:shield-check-bold-duotone" 
                     className="text-3xl mb-2"
                     style={{ color: COLORS.starGold }}
                   />
                   <div className="text-2xl font-black text-white mb-1">
                     Active
                   </div>
                   <div 
                     className="text-[8px] uppercase tracking-wider opacity-60"
                     style={{ color: COLORS.neutralGray }}
                   >
                     Account Status
                   </div>
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* Points Packages Carousel - Redesigned */}
        <div 
          className="mb-8 sm:mb-16 relative overflow-hidden rounded-[24px] sm:rounded-[40px] p-6 sm:p-10 md:p-16 backdrop-blur-xl border border-white/5"
          
          
          
          style={{ 
            backgroundColor: `${COLORS.surface}dd`,
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}
        >
          {/* Animated background decorations */}
          <div className="absolute inset-0 opacity-5 overflow-hidden">
            <div 
              className="absolute top-0 right-0 w-96 h-96"
              
              
            >
              <Icon
                icon="solar:wallet-money-bold-duotone"
                className="w-full h-full"
                style={{ color: COLORS.primary }}
              />
            </div>
            <div 
              className="absolute bottom-0 left-0 w-64 h-64"
              
              
            >
              <Icon
                icon="solar:bag-smile-bold-duotone"
                className="w-full h-full"
                style={{ color: COLORS.secondary }}
              />
            </div>
          </div>

          <div className="relative z-10">
            <h2
              className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight mb-3 flex items-center justify-center gap-3"
              style={{ color: COLORS.neutralWhite }}
              
              
              
            >
              <Icon
                icon="solar:bag-smile-bold-duotone"
                style={{ color: COLORS.primary }}
                className="text-2xl sm:text-4xl"
              />
              Buy Points
            </h2>
            <p 
              className="text-center text-sm mb-10 opacity-60"
              style={{ color: COLORS.neutralGray }}
            >
              Choose the perfect package for your spiritual journey
            </p>

             {/* Carousel Container */}
             <div className="overflow-hidden" ref={useRef(null)}>
               <div
                 className="flex transition-transform duration-500 ease-out"
                 style={{ transform: `translateX(-${carouselIndex * (100 / cardsPerView)}%)` }}
               >
                 {pointsPackages.map((pkg, idx) => (
                   <div
                     key={pkg.label}
                     className="flex-shrink-0"
                     style={{
                       width: `${100 / cardsPerView}%`,
                       padding: idx === 0 ? '0 0.75rem 0 0' : 
                                idx === pointsPackages.length - 1 ? '0 0 0 0.75rem' : 
                                '0 0.75rem',
                     }}
                   >
                     <div
                       className={`p-6 sm:p-8 md:p-10 rounded-[20px] sm:rounded-[28px] border cursor-pointer relative overflow-hidden group flex flex-col h-full ${
                         selectedPackage?.label === pkg.label
                           ? "border-2"
                           : "border-white/10"
                       }`}
                       style={{
                         backgroundColor: `${COLORS.dark}dd`,
                         backdropFilter: 'blur(20px)',
                         borderColor:
                           selectedPackage?.label === pkg.label
                             ? COLORS.primary
                             : undefined,
                         boxShadow:
                           selectedPackage?.label === pkg.label
                             ? `0 0 40px ${COLORS.primary}30, 0 20px 50px rgba(0,0,0,0.5)`
                             : '0 10px 30px rgba(0,0,0,0.3)',
                         minHeight: '400px',
                       }}
                       onClick={() => setSelectedPackage(pkg)}
                    
                    
                    
                    
                  >
                    {/* Glow effect on hover */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                      style={{
                        background: `radial-gradient(circle at 50% 0%, ${COLORS.primary}15 0%, transparent 70%)`
                      }}
                    />
                    
                    <div className="relative z-10 flex flex-col h-full">
                      <div
                        className="text-[9px] font-black uppercase tracking-[0.3em] mb-6 opacity-60"
                        style={{ color: COLORS.neutralGray }}
                      >
                        {pkg.label}
                      </div>
                      
                      <div className="mb-6 sm:mb-8">
                        <div 
                          className="text-4xl sm:text-6xl md:text-7xl font-black mb-3"
                          style={{
                            background: `linear-gradient(135deg, ${COLORS.neutralWhite} 0%, ${COLORS.primary} 100%)`,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                          }}
                        >
                          {pkg.points.toLocaleString()}
                        </div>
                        <div 
                          className="text-base font-bold uppercase tracking-wider" 
                          style={{ color: COLORS.neutralGray }}
                        >
                          Points
                        </div>
                      </div>

                      <div
                        className="text-3xl sm:text-4xl md:text-5xl font-black mb-auto"
                        style={{ color: COLORS.primary }}
                      >
                        {formatCurrency(pkg.price)}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePurchase(pkg);
                        }}
                        disabled={loading}
                        className="w-full px-4 sm:px-6 py-4 sm:py-5 rounded-2xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group/btn mt-6 sm:mt-8"
                        style={{
                          backgroundColor: COLORS.primary,
                          color: COLORS.dark,
                          boxShadow: `0 10px 30px ${COLORS.primary}30`
                        }}
                        
                        
                      >
                        <span className="relative z-10">
                          {loading ? "Processing..." : "Buy Now"}
                        </span>
                        <div
                          className="absolute inset-0 opacity-0 group-hover/btn:opacity-100"
                          style={{
                            background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`
                          }}
                          
                        />
                       </button>
                     </div>
                   </div>
                    </div>
                 ))}
              </div>
            </div>

            {/* Carousel Navigation */}
            <div className="flex items-center justify-center gap-6 mt-10">
              <button
                
                
                onClick={() => setCarouselIndex(Math.max(0, carouselIndex - 1))}
                disabled={carouselIndex === 0}
                className="w-14 h-14 rounded-2xl border flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed backdrop-blur-xl"
                style={{
                  backgroundColor: `${COLORS.dark}dd`,
                  borderColor: COLORS.primary,
                  boxShadow: `0 5px 20px ${COLORS.primary}20`
                }}
              >
                <Icon
                  icon="ph:caret-left-bold"
                  className="text-2xl"
                  style={{ color: COLORS.primary }}
                />
              </button>

              {/* Dots Indicator */}
              <div className="flex gap-2">
                {Array.from({ length: Math.ceil(pointsPackages.length / cardsPerView) }).map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCarouselIndex(index)}
                    className="transition-all"
                    
                    style={{
                      width: carouselIndex === index ? "40px" : "10px",
                      height: "10px",
                      borderRadius: "5px",
                      backgroundColor:
                        carouselIndex === index
                          ? COLORS.primary
                          : `${COLORS.neutralGray}30`,
                      boxShadow: carouselIndex === index 
                        ? `0 0 15px ${COLORS.primary}50` 
                        : 'none'
                    }}
                  />
                ))}
              </div>

              <button
                
                
                onClick={() =>
                  setCarouselIndex(
                    Math.min(Math.ceil(pointsPackages.length / cardsPerView) - 1, carouselIndex + 1)
                  )
                }
                disabled={carouselIndex >= Math.ceil(pointsPackages.length / cardsPerView) - 1}
                className="w-14 h-14 rounded-2xl border flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed backdrop-blur-xl"
                style={{
                  backgroundColor: `${COLORS.dark}dd`,
                  borderColor: COLORS.primary,
                  boxShadow: `0 5px 20px ${COLORS.primary}20`
                }}
              >
                <Icon
                  icon="ph:caret-right-bold"
                  className="text-2xl"
                  style={{ color: COLORS.primary }}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div
            className="p-6 rounded-3xl border border-red-500/20 mb-8 backdrop-blur-xl"
            style={{ backgroundColor: "rgba(248, 113, 113, 0.1)" }}
            
            
          >
            <div className="flex items-center gap-3">
              <Icon icon="solar:danger-circle-bold-duotone" className="text-3xl text-red-400" />
              <p className="text-red-400 text-sm font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Transaction History */}
        <div
          
          
          
        >
          <div className="flex items-center justify-between mb-8">
            <h2
              className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight flex items-center gap-3"
              style={{ color: COLORS.neutralWhite }}
            >
              <Icon
                icon="solar:history-bold-duotone"
                style={{ color: COLORS.primary }}
                className="text-2xl sm:text-4xl"
              />
              Transaction History
            </h2>
            
            {transactions.length > 0 && (
              <div
                className="px-4 py-2 rounded-full border border-white/10 backdrop-blur-xl"
                style={{ backgroundColor: `${COLORS.surface}80` }}
                
              >
                <span 
                  className="text-[9px] font-black uppercase tracking-wider"
                  style={{ color: COLORS.primary }}
                >
                  {transactionsData?.total || 0} Total
                </span>
              </div>
            )}
          </div>

          {loading && transactions.length === 0 ? (
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
                Loading transactions...
              </p>
            </div>
          ) : transactions.length === 0 ? (
            <div
              className="p-8 sm:p-12 md:p-16 rounded-[24px] sm:rounded-[32px] border border-white/5 text-center backdrop-blur-xl"
              style={{ 
                backgroundColor: `${COLORS.surface}80`,
                boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
              }}
            >
              <div>
                <Icon
                  icon="solar:document-text-bold-duotone"
                  className="text-5xl sm:text-7xl mx-auto mb-4 sm:mb-6 opacity-20"
                  style={{ color: COLORS.neutralGray }}
                />
              </div>
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
              <div className="space-y-4">
                {transactions.map((transaction: Transaction, idx) => {
                  const typeDisplay = getTypeDisplay(transaction.transaction_type);
                  const statusDisplay = getStatusDisplay(transaction.status);
                  const isCredit =
                    transaction.transaction_type === TransactionType.CREDIT;

                  return (
                    <div
                      key={transaction.id}
                      className="p-6 md:p-8 rounded-[28px] border border-white/5 hover:border-white/15 transition-all backdrop-blur-xl group relative overflow-hidden"
                      style={{ 
                        backgroundColor: `${COLORS.surface}cc`,
                        boxShadow: '0 8px 30px rgba(0,0,0,0.2)'
                      }}
                      
                      
                      
                      
                    >
                      {/* Subtle gradient overlay on hover */}
                      <div 
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{
                          background: `linear-gradient(135deg, ${typeDisplay.color}05 0%, transparent 70%)`
                        }}
                      />

                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between relative z-10 gap-4 sm:gap-0">
                        <div className="flex items-center gap-3 sm:gap-5 w-full sm:w-auto">
                          <div
                            className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center relative flex-shrink-0"
                            style={{
                              backgroundColor: `${typeDisplay.color}15`,
                              border: `2px solid ${typeDisplay.color}30`
                            }}
                          >
                            <Icon
                              icon={typeDisplay.icon}
                              className="text-xl sm:text-3xl"
                              style={{ color: typeDisplay.color }}
                            />
                          </div>
                          <div className="min-w-0 flex-1 sm:flex-none">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1 sm:mb-2">
                              <span className="text-white font-bold text-sm sm:text-base truncate">
                                {transaction.description}
                              </span>
                              <div 
                                className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full flex items-center gap-1.5 self-start sm:self-auto"
                                style={{ 
                                  backgroundColor: `${statusDisplay.color}15`,
                                  border: `1px solid ${statusDisplay.color}30`
                                }}
                              >
                                <div
                                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                                  style={{
                                    backgroundColor: statusDisplay.color,
                                  }}
                                />
                                <span
                                  style={{
                                    color: statusDisplay.color,
                                    fontSize: "9px",
                                  }}
                                  className="font-black uppercase tracking-wider"
                                >
                                  {statusDisplay.label}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                              <span
                                className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide flex items-center gap-2"
                                style={{ color: COLORS.neutralGray }}
                              >
                                <Icon icon="solar:calendar-bold-duotone" className="text-xs sm:text-sm" />
                                {formatDate(transaction.created_at)}
                              </span>
                              <span
                                className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider opacity-40 flex items-center gap-1"
                                style={{ color: COLORS.neutralGray }}
                              >
                                <Icon icon="solar:hashtag-bold" className="text-[10px] sm:text-xs" />
                                {transaction.id.toString().padStart(6, "0")}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right self-end sm:self-auto">
                          <div
                            className="text-2xl sm:text-3xl md:text-4xl font-black mb-1"
                            style={{
                              color: isCredit ? "#4ADE80" : "#F87171",
                            }}
                          >
                            {isCredit ? "+" : "-"}
                            {transaction.amount.toLocaleString()}
                          </div>
                          <div
                            className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider opacity-50"
                            style={{ color: COLORS.neutralGray }}
                          >
                            Balance: {transaction.balance_after.toLocaleString()}
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
                  style={{
                    backgroundColor: `${COLORS.surface}80`,
                  }}

                >
                  <div
                    className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider opacity-60 text-center md:text-left"
                    style={{ color: COLORS.neutralGray }}
                  >
                    Page {currentPage} of {transactionsData.pages} • {transactionsData.total} transactions
                  </div>

                  <div
                    className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-xl sm:rounded-2xl border backdrop-blur-xl"
                    style={{
                      backgroundColor: `${COLORS.dark}cc`,
                      borderColor: `${COLORS.primary}20`,
                    }}
                  >
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((prev) => prev - 1)}
                      className="p-2 sm:p-3 rounded-xl transition-all hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed"
                      
                      
                    >
                      <Icon
                        icon="solar:alt-arrow-left-linear"
                        className="text-xl"
                        style={{ color: COLORS.primary }}
                      />
                    </button>

                    <div className="flex items-center gap-1 sm:gap-2 px-1 sm:px-2">
                      {Array.from({ length: transactionsData.pages }, (_, i) => i + 1)
                        .filter((page) => {
                          return (
                            page === 1 ||
                            page === transactionsData.pages ||
                            Math.abs(page - currentPage) <= 1
                          );
                        })
                        .map((page, idx, arr) => {
                          const prevPage = arr[idx - 1];
                          const showEllipsis = prevPage && page - prevPage > 1;

                          return (
                            <div key={page} className="flex items-center gap-1 sm:gap-2">
                              {showEllipsis && (
                                <span
                                  className="px-1 sm:px-2 text-[10px] sm:text-xs"
                                  style={{ color: COLORS.neutralGray }}
                                >
                                  ...
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

                    <button
                      disabled={currentPage === transactionsData.pages}
                      onClick={() => setCurrentPage((prev) => prev + 1)}
                      className="p-3 rounded-xl transition-all hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed"
                      
                      
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

      {/* Success Modal - Enhanced */}
      
        {showSuccessModal && (
          <div
            
            
            
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ 
              backgroundColor: "rgba(0, 0, 0, 0.85)",
              backdropFilter: 'blur(10px)'
            }}
            onClick={closeSuccessModal}
          >
            <div
              
              
              
              
              className="p-6 sm:p-10 rounded-[24px] sm:rounded-[40px] border max-w-md w-full relative overflow-hidden mx-4 sm:mx-0"
              style={{
                backgroundColor: `${COLORS.surface}dd`,
                borderColor: `${COLORS.primary}60`,
                boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 80px ${COLORS.primary}30`
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Animated background particles */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`,
                      backgroundColor: COLORS.primary,
                      opacity: 0.3
                    }}
                  />
                ))}
              </div>

              <div className="text-center relative z-10">
                <div
                  className="w-20 h-20 sm:w-28 sm:h-28 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 relative"
                  style={{
                    backgroundColor: `${COLORS.primary}20`,
                    border: `3px solid ${COLORS.primary}40`
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
                      opacity: 0.5
                    }}
                    
                    
                  />
                </div>
                <h2
                  className="text-3xl sm:text-4xl md:text-5xl font-black uppercase mb-3 sm:mb-4"
                  style={{ 
                    background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Success!
                </h2>
                <p
                  className="text-sm sm:text-base mb-6 sm:mb-8 font-light px-2"
                  style={{ color: COLORS.neutralGray }}
                >
                  Your top-up was successful! Your points have been added to your account.
                </p>
                <button
                  onClick={closeSuccessModal}
                  className="w-full py-3 sm:py-4 rounded-2xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all relative overflow-hidden group"
                  style={{
                    backgroundColor: COLORS.primary,
                    color: COLORS.dark,
                    boxShadow: `0 10px 40px ${COLORS.primary}40`
                  }}
                  
                  
                >
                  <span className="relative z-10">Continue</span>
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100"
                    style={{
                      background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`
                    }}
                  />
                </button>
              </div>
            </div>
          </div>
        )}
      

      {/* Error Modal - Enhanced */}
      
        {showErrorModal && (
          <div
            
            
            
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ 
              backgroundColor: "rgba(0, 0, 0, 0.85)",
              backdropFilter: 'blur(10px)'
            }}
            onClick={closeErrorModal}
          >
            <div
              
              
              
              
               className="p-6 sm:p-10 rounded-[24px] sm:rounded-[40px] border max-w-md w-full relative overflow-hidden mx-4 sm:mx-0"
              style={{
                backgroundColor: `${COLORS.surface}dd`,
                borderColor: "rgba(248, 113, 113, 0.6)",
                boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 80px rgba(248, 113, 113, 0.2)`
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Animated background */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`,
                      backgroundColor: "#F87171",
                      opacity: 0.2
                    }}
                  />
                ))}
              </div>

              <div className="text-center relative z-10">
                <div
                  className="w-20 h-20 sm:w-28 sm:h-28 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 relative"
                  style={{
                    backgroundColor: "rgba(248, 113, 113, 0.15)",
                    border: `3px solid rgba(248, 113, 113, 0.3)`
                  }}
                >
                  <Icon
                    icon="solar:close-circle-bold-duotone"
                    className="text-5xl sm:text-7xl"
                    style={{ color: "#F87171" }}
                  />
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      border: `2px solid #F87171`,
                      opacity: 0.5
                    }}
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
                  Your payment could not be processed. Please try again or contact support if the issue persists.
                </p>
                <button
                  onClick={closeErrorModal}
                  className="w-full py-3 sm:py-4 rounded-2xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all relative overflow-hidden group"
                  style={{
                    backgroundColor: "#F87171",
                    color: COLORS.dark,
                    boxShadow: `0 10px 40px rgba(248, 113, 113, 0.4)`
                  }}
                  
                  
                >
                  <span className="relative z-10">Try Again</span>
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100"
                    style={{
                      background: `linear-gradient(135deg, #F87171 0%, #EF4444 100%)`
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

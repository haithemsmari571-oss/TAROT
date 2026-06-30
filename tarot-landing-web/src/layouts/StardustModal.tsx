import { useState } from "react";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../theme";

export interface PurchasePackage {
  id: string; 
  points: number;
  price: number; // Price in cents (e.g., 500 = $5.00)
  label: string;
  // TODO: Add any new data properties here (e.g., originalPrice, discountPct, badgeText)
}

interface StardustModalProps {
  isOpen: boolean;
  onClose: () => void;
  buyOptions: PurchasePackage[];
  loadingTierId: string | null;
  onPurchase: (pkg: PurchasePackage) => Promise<void>;
  // NEW FUNCTIONALITY HOOKS (Add your new prop definitions below)
  // currentBalance?: number;
  // promoCodeActive?: boolean;
}

export function StardustModal({
  isOpen,
  onClose,
  buyOptions = [],
  loadingTierId,
  onPurchase,
}: StardustModalProps) {
  // Local state for independent loading boundaries
  const [localLoadingId, setLocalLoadingId] = useState<string | null>(null);
  
  // NEW STATE: Place any new local reactive hooks here (e.g., activeTab, promoInput)

  if (!isOpen) return null;

  const isAnyLoading = loadingTierId !== null || localLoadingId !== null;

  const formatCurrency = (amountInCents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountInCents / 100);

  const handleLocalPurchase = async (pkg: PurchasePackage) => {
    try {
      setLocalLoadingId(pkg.id);
      await onPurchase(pkg);
    } catch (err) {
      console.error("Stripe modal redirection error:", err);
    } finally {
      setLocalLoadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      {/* Backdrop Close Layer */}
      <div
        onClick={() => !isAnyLoading && onClose()}
        className="absolute inset-0 bg-black/95 backdrop-blur-md transition-opacity duration-300"
      />

      {/* Main Modal Display Card */}
      <div
        className="relative w-full max-w-lg max-h-[85vh] sm:max-h-[90vh] flex flex-col rounded-[32px] border border-white/10 overflow-hidden shadow-2xl transition-all transform duration-300"
        style={{
          backgroundColor: `${COLORS.surface}dd`,
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Upper Background Visual Depth Accent Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-36 bg-primary/10 blur-[80px] pointer-events-none -z-10" />

        {/* Modal Header */}
        <div className="flex justify-between items-start p-6 sm:p-8 border-b border-white/5 flex-shrink-0">
          <div>
            <h2
              style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}
              className="text-3xl sm:text-4xl font-black text-white italic uppercase tracking-tighter leading-none"
            >
              Gather <span style={{ color: COLORS.primary }}>Stardust</span>
            </h2>
            <p className="text-[9px] uppercase tracking-[0.25em] text-white/50 font-bold mt-2.5">
              Select an astral tier to reload credit
            </p>
          </div>
          <button
            disabled={isAnyLoading}
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-white/40 hover:text-white border border-white/5 hover:border-white/10 transition-all disabled:opacity-30 cursor-pointer"
          >
            <Icon icon="ph:x-bold" className="text-base" />
          </button>
        </div>

        {/* INSERT NEW FEATURE COMPONENT HERE (e.g., Tab selectors, Balance bars) */}

        {/* Scrollable Core Packages Container */}
        <div className="flex-grow overflow-y-auto p-6 sm:p-8 space-y-4 custom-scrollbar max-h-[45vh] sm:max-h-[50vh]">
          {buyOptions.map((pkg, idx) => {
            // Business logic for badges
            const isPopular = idx === 2 || pkg.points === 50;
            const isCurrentItemLoading = loadingTierId === pkg.id || localLoadingId === pkg.id;

            return (
              <div
                key={pkg.id || pkg.label}
                style={{
                  borderColor: isPopular ? `${COLORS.primary}30` : "rgba(255,255,255,0.05)",
                  backgroundColor: `${COLORS.dark}dd`,
                }}
                className={`relative flex flex-col sm:flex-row sm:items-center justify-between p-5 sm:p-6 rounded-2xl border transition-all group overflow-hidden ${
                  isPopular ? "shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]" : ""
                } ${isAnyLoading && !isCurrentItemLoading ? "opacity-40" : ""}`}
              >
                {/* Hover Glow Effect */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 0% 0%, ${COLORS.primary}08 0%, transparent 60%)`,
                  }}
                />

                {isPopular && (
                  <span
                    style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
                    className="absolute top-0 right-6 px-3 py-0.5 text-[8px] font-black rounded-b-md uppercase tracking-[0.15em] shadow-md"
                  >
                    Council Choice
                  </span>
                )}

                {/* Package Metrics */}
                <div className="relative z-10 flex flex-col mb-4 sm:mb-0">
                  <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] mb-1.5 group-hover:text-primary/70 transition-colors">
                    {pkg.label}
                  </span>
                  <div className="flex items-center gap-2.5">
                    <Icon
                      icon="ph:sparkle-fill"
                      style={{ color: COLORS.primary }}
                      className="text-lg animate-pulse"
                    />
                    <span className="text-2xl sm:text-3xl font-black text-white tracking-tighter">
                      {pkg.points.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider ml-1 mt-1">
                      Points
                    </span>
                  </div>
                </div>

                {/* Pricing Controls Action Row */}
                <div className="relative z-10 flex items-center justify-between sm:justify-end gap-4 border-t border-white/5 sm:border-0 pt-3 sm:pt-0">
                  <div className="text-xl sm:text-2xl font-black tracking-tight text-white/90">
                    {formatCurrency(pkg.price)}
                  </div>
                  <button
                    disabled={isAnyLoading}
                    onClick={() => handleLocalPurchase(pkg)}
                    style={{
                      backgroundColor: COLORS.primary,
                      color: COLORS.dark,
                      boxShadow: `0 4px 20px ${COLORS.primary}25`,
                    }}
                    className="px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-40 disabled:scale-100 disabled:cursor-not-allowed flex items-center gap-2 min-w-[130px] justify-center cursor-pointer"
                  >
                    {isCurrentItemLoading ? (
                      <>
                        <Icon icon="svg-spinners:3-dots-fade" className="text-base" />
                        <span>Securing...</span>
                      </>
                    ) : (
                      <>
                        <span>Buy Now</span>
                        <Icon
                          icon="ph:arrow-right-bold"
                          className="text-xs group-hover:translate-x-0.5 transition-transform"
                        />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Processing Safeguard Guard Panel */}
        <div className="p-6 sm:p-8 border-t border-white/5 bg-white/[0.01] flex-shrink-0">
          <div className="flex items-center justify-center gap-3 opacity-20 mb-3">
            <div className="h-[1px] flex-1 bg-white" />
            <Icon icon="ph:shield-check-bold" className="text-white text-lg" />
            <div className="h-[1px] flex-1 bg-white" />
          </div>
          <p className="text-[8px] text-center text-white/40 font-bold uppercase tracking-[0.25em]">
            Encrypted Checkout Managed Securely via Stripe
          </p>
        </div>
      </div>
    </div>
  );
}
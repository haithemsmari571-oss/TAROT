import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { Icon } from "@iconify/react";
import StardustGlider from "../components/StardustGlider";
import { usePayment } from "../hooks/usePayment";
import { TYPOGRAPHY } from "@/theme";

export interface TopUpOptions {
  /**
   * Where Stripe returns after checkout. MUST contain a query string — the
   * backend appends "&status=success". Defaults to the current path + "?topup=1".
   */
  returnUrl?: string;
  /** Optional warm line shown above the glider (e.g. why she's topping up). */
  reason?: string;
  /**
   * Runs right before the Stripe redirect (only once she commits by picking an
   * amount and buying). Used by the in-session flow to pause the reading so she
   * isn't billed during the checkout round-trip. If it throws, checkout aborts.
   */
  onBeforeCheckout?: () => Promise<void>;
}

interface TopUpContextValue {
  open: (options?: TopUpOptions) => void;
  close: () => void;
}

const TopUpContext = createContext<TopUpContextValue | null>(null);

/**
 * Every "Add Stardust" entry point in the app opens this one modal — the same
 * StardustGlider used on the Billing page — instead of a fixed-price checkout,
 * a full-page bounce, or a dead end. Mounted once globally; opened via useTopUp.
 */
export function useTopUp(): TopUpContextValue {
  const ctx = useContext(TopUpContext);
  if (!ctx) throw new Error("useTopUp must be used within a TopUpProvider");
  return ctx;
}

export function TopUpProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<TopUpOptions | null>(null);

  const open = useCallback((o?: TopUpOptions) => setOptions(o ?? {}), []);
  const close = useCallback(() => setOptions(null), []);

  return (
    <TopUpContext.Provider value={{ open, close }}>
      {children}
      {options && <StardustGliderModal options={options} onClose={close} />}
    </TopUpContext.Provider>
  );
}

function StardustGliderModal({
  options,
  onClose,
}: {
  options: TopUpOptions;
  onClose: () => void;
}) {
  const { createStardustCheckoutSession } = usePayment();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePurchase = useCallback(
    async (amountUsd: number) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        // e.g. pause the live reading before we leave for Stripe.
        await options.onBeforeCheckout?.();
        const returnUrl =
          options.returnUrl ?? `${window.location.pathname}?topup=1`;
        // Redirects to Stripe; nothing runs after this on success.
        await createStardustCheckoutSession({
          amount_usd: amountUsd,
          return_url: returnUrl,
        });
      } catch (e: any) {
        setError(
          e?.response?.data?.detail ??
            e?.message ??
            "We couldn't start checkout. Please try again."
        );
        setBusy(false);
      }
    },
    [busy, options, createStardustCheckoutSession]
  );

  return (
    <div
      className="fixed inset-0 z-[210] flex items-start justify-center overflow-y-auto p-4 sm:p-6"
      style={{
        backgroundColor: "rgba(5,5,8,0.94)",
        backdropFilter: "blur(10px)",
        fontFamily: TYPOGRAPHY.fontFamily.body,
      }}
    >
      <div className="relative my-auto w-full max-w-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-1 -top-1 z-20 rounded-full p-2 text-white/50 transition-colors hover:text-white/90"
        >
          <Icon icon="solar:close-circle-bold" className="text-3xl" />
        </button>

        {options.reason && (
          <p className="mb-4 px-2 text-center text-sm leading-relaxed text-white/70">
            {options.reason}
          </p>
        )}

        <StardustGlider onPurchase={handlePurchase} loading={busy} />

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

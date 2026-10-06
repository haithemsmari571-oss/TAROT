import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { Icon } from "@iconify/react";
import { isAxiosError } from "axios";
import { useBillingMode } from "@/features/billing-mode/BillingModeContext";
import { PER_MESSAGE_COPY } from "@/features/chat/perMessage";
import ConfirmEmailSheet, { EMAIL_NOT_CONFIRMED } from "@/features/client-app/ConfirmEmailSheet";
import { useRefundAfterHours } from "@/features/client-app/useWelcomeCredit";
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

const CHECKOUT_FAILED = "We couldn't start checkout. Please try again.";

// What Tab can land on inside the window (and inside the mobile menu, Navbar.tsx).
export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const [confirmEmail, setConfirmEmail] = useState(false);
  // The refund promise under the Buy button: per-message only (a per-minute
  // reading has no such refund), with the server's own refund window, and
  // nothing until both are known.
  const { billingMode } = useBillingMode();
  const refundAfterHours = useRefundAfterHours();
  const refundLine = billingMode === "per_message" && refundAfterHours !== undefined
    ? PER_MESSAGE_COPY.refundGuarantee(refundAfterHours)
    : null;

  // The window is a dialog (ROUND35 A5), named by the glider's heading: focus
  // moves in when it opens, Tab and Shift+Tab stay inside, Escape closes it,
  // and focus goes back to what opened it (Add Stardust).
  const titleId = useId();
  const windowRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, confirmEmail });
  useEffect(() => {
    latest.current = { onClose, confirmEmail };
  });
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const stops = () =>
      [...(windowRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.getClientRects().length > 0);
    stops()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      // The confirm-email sheet is a native modal dialog with its own Escape and Tab.
      if (latest.current.confirmEmail) return;
      if (event.key === "Escape") {
        event.preventDefault();
        latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const all = stops();
      if (all.length === 0) return;
      const first = all[0];
      const last = all[all.length - 1];
      const inside = windowRef.current?.contains(document.activeElement) ?? false;
      if (event.shiftKey ? !inside || document.activeElement === first : !inside || document.activeElement === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // On a phone the line sits under the glider, below the fold (ROUND58 at
  // 390x844): it is brought into view when it appears, so Buy never fails
  // in silence.
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

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
      } catch (failure) {
        setBusy(false);
        // Her first top-up waits for her confirmed email (ROUND38): the
        // server refused before Stripe, so the confirm sheet, not an error.
        if (isAxiosError(failure) && failure.response?.status === 403
          && failure.response.data?.detail === EMAIL_NOT_CONFIRMED) {
          setConfirmEmail(true);
          return;
        }
        // Always the window's own words: the server's text named the Stripe
        // key it was given (masked) and its own settings, and the browser's
        // is "Request failed with status code 400" or "Network Error".
        setError(CHECKOUT_FAILED);
      }
    },
    [busy, options, createStardustCheckoutSession]
  );

  return (
    <div
      ref={windowRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-hall-exempt=""
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

        <StardustGlider onPurchase={handlePurchase} loading={busy} titleId={titleId} />

        {refundLine && (
          <p data-topup-refund="" className="mt-4 px-2 text-center text-xs leading-relaxed text-white/70">
            {refundLine}
          </p>
        )}

        {error && (
          <div
            ref={errorRef}
            role="alert"
            style={{ scrollMarginBottom: 16 }}
            className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-sm text-red-400"
          >
            {error}
          </div>
        )}
      </div>
      <ConfirmEmailSheet open={confirmEmail} onClose={() => setConfirmEmail(false)} />
    </div>
  );
}

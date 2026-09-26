/* The welcome credit a new account is given, in pounds (1 Stardust is £1).
   The figure is the server's own: the "signup_bonus" setting that sign_up
   awards (TAROT-BACKEND app/services/auth.py, parse_signup_bonus), served on
   the public GET /settings/public as signup_bonus_gbp, 0 when the setting is
   missing or invalid. Read once and kept for the visit, so every welcome line
   on the reader cards and profiles, signed in or out, draws the same number.
   undefined until the answer arrives, and when the request fails, so no line
   is ever drawn from a guess; 0 means there is no credit and no line. The
   same answer carries refund_after_hours, the refund window the reader
   profile promises (useRefundAfterHours). */
import { useQuery } from "@tanstack/react-query";
import axiosClient from "@/lib/axiosClient";
import { formatGbp } from "@/lib/currency";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { UserRole } from "@/features/auth/types/auth.types";
import { paymentApi } from "@/features/payment/api/paymentApi";

export const PUBLIC_SETTINGS_PATH = "/settings/public";
const PUBLIC_SETTINGS_QUERY_KEY = ["public-settings"] as const;
/* Her balance answer, read afresh on each visit to a gift line (useGiftCredit). */
const GIFT_CREDIT_BALANCE_QUERY_KEY = "gift-credit-balance";
/* The settings change when the owner changes them, not during a visit. */
const PUBLIC_SETTINGS_STALE_MS = 60 * 60_000;

/** The fields of GET /settings/public the app reads. */
interface PublicSettings {
  signup_bonus_gbp: number;
  /** hours before an unanswered message is refunded (offline_replies.refund_after_hours) */
  refund_after_hours: number;
}

/** One request for both figures, read once and kept for the visit. */
function usePublicFigure(field: keyof PublicSettings): number | undefined {
  const { data } = useQuery({
    queryKey: PUBLIC_SETTINGS_QUERY_KEY,
    queryFn: async () => (await axiosClient.get<PublicSettings>(PUBLIC_SETTINGS_PATH)).data,
    staleTime: PUBLIC_SETTINGS_STALE_MS,
  });
  const value = data?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function useWelcomeCredit(): number | undefined {
  return usePublicFigure("signup_bonus_gbp");
}

/** The refund window the reader profile promises, the server's own figure;
    undefined until it arrives, so the promise is never drawn from a guess. */
export function useRefundAfterHours(): number | undefined {
  return usePublicFigure("refund_after_hours");
}

/** The welcome credit a gift line may promise to whoever is looking. A guest,
    a reader or an admin is promised the server's figure. A signed-in client
    is promised it only while she still holds all of it: her free credit (the
    balance answer's credit_balance, GET /transactions/me/balance) below the
    figure means she has used it, and the answer is 0, so no gift line.
    undefined until both answers arrive, so no line is drawn from a guess;
    her balance counts only once this screen's own request has answered, so
    an answer cached before her last message is never used. */
export function useGiftCredit(): number | undefined {
  const credit = useWelcomeCredit();
  const { isAuthenticated, user } = useAuth();
  const isClient = isAuthenticated && user?.role === UserRole.USER;
  const { data: balance, isFetchedAfterMount } = useQuery({
    queryKey: [GIFT_CREDIT_BALANCE_QUERY_KEY, user?.id],
    queryFn: paymentApi.getMyBalance,
    enabled: isClient,
  });
  if (!isClient || credit === undefined) return credit;
  const left = isFetchedAfterMount ? balance?.credit_balance : undefined;
  if (typeof left !== "number") return undefined;
  return left >= credit ? credit : 0;
}

/** True when there is a credit to promise: the figure is known and above 0. */
export function hasWelcomeCredit(creditGbp: number | undefined): creditGbp is number {
  return creditGbp !== undefined && creditGbp > 0;
}

/** "£100 free · 40 messages": the credit and the whole messages it buys at
    this reader's price, rounded down so the line never over-promises. */
export function welcomeCreditLine(creditGbp: number, pricePerMessage: number): string {
  return `${formatGbp(creditGbp)} free · ${Math.floor(creditGbp / pricePerMessage)} messages`;
}

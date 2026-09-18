/* The You tab: her Stardust, her recent activity and her account, on the
   shell's living sky. The machinery is the site's own: usePayment for the
   balance and the ledger, the global top-up window (the glider and its
   checkout) for adding Stardust, the auth context for who she is and for
   logging out. */
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks";
import { TransactionStatus, TransactionType, type Transaction } from "@/features/ledger/types/transaction.types";
import { useTopUp } from "@/features/payment/context/TopUpContext";
import { usePayment } from "@/features/payment/hooks/usePayment";
import { formatGbp } from "@/lib/currency";
import { clockAt, dayOf } from "./ukTime";
import "./client-chats.css";
import "./client-you.css";

export const YOU_PATH = "/app/you";
const ACTIVITY_PAGE_SIZE = 10;

const ACTIVITY_TITLES: Partial<Record<TransactionType, string>> = {
  [TransactionType.CREDIT]: "Stardust added",
  [TransactionType.DEBIT]: "Reading",
  [TransactionType.BONUS]: "Welcome credit",
  [TransactionType.GIFT]: "Gift",
  [TransactionType.REFUND]: "Refund",
};
const INCOMING = new Set<TransactionType>([TransactionType.CREDIT, TransactionType.BONUS, TransactionType.GIFT, TransactionType.REFUND]);
const STATUS_WORDS: Partial<Record<TransactionStatus, string>> = {
  [TransactionStatus.PENDING]: "Pending",
  [TransactionStatus.FAILED]: "Failed",
  [TransactionStatus.REVERSED]: "Reversed",
};

const PAYMENT_LINES = {
  success: "Payment received. Your Stardust is ready.",
  error: "Payment did not complete. Nothing was charged.",
} as const;
type PaymentOutcome = keyof typeof PAYMENT_LINES;

interface Activity {
  rows: Transaction[];
  page: number;
  pages: number;
  total: number;
  state: "loading" | "ready" | "error";
  /** The page a failed request asked for, so Try again asks for it again. */
  failedPage: number;
}

function ActivityRow({ row }: { row: Transaction }) {
  const incoming = INCOMING.has(row.transaction_type);
  const debit = row.transaction_type === TransactionType.DEBIT;
  const status = row.status === TransactionStatus.COMPLETED ? null : STATUS_WORDS[row.status] ?? null;
  return (
    <li className="client-you-row" data-transaction-id={row.id}>
      <span className="client-you-row-text">
        <span className="client-you-row-title">{ACTIVITY_TITLES[row.transaction_type] ?? "Transfer"}</span>
        <time className="client-you-row-time" dateTime={row.created_at}>
          {`${dayOf(row.created_at)} · ${clockAt(row.created_at)}`}{status && ` · ${status}`}
        </time>
      </span>
      <span className={`client-you-amount${incoming ? " is-in" : ""}`}>
        {incoming ? "+" : debit ? "−" : ""}{formatGbp(row.amount)}
      </span>
    </li>
  );
}

export default function ClientYouScreen() {
  const { user, logout } = useAuth();
  const { open: openTopUp } = useTopUp();
  const { balance, fetchMyBalance, fetchMyTransactions } = usePayment();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const [payment, setPayment] = useState<PaymentOutcome | null>(null);
  const [activity, setActivity] = useState<Activity>({ rows: [], page: 0, pages: 0, total: 0, state: "loading", failedPage: 1 });

  // Only the newest ledger request may write the list, so a reload never
  // interleaves with an older page.
  const request = useRef(0);

  const refreshBalance = () => { fetchMyBalance().catch(() => { /* the figure keeps its dash */ }); };
  const loadActivity = async (page: number) => {
    const ticket = ++request.current;
    setActivity(current => ({ ...current, state: "loading" }));
    try {
      // usePayment keeps only the latest page, so the screen appends it itself
      const data = await fetchMyTransactions({ page, limit: ACTIVITY_PAGE_SIZE });
      if (ticket !== request.current) return;
      setActivity(current => ({
        rows: page === 1 ? data.transactions : [...current.rows, ...data.transactions],
        page: data.page,
        pages: data.pages,
        total: data.total,
        state: "ready",
        failedPage: page,
      }));
    } catch {
      if (ticket !== request.current) return;
      setActivity(current => ({ ...current, state: "error", failedPage: page }));
    }
  };
  // usePayment hands back new functions on every render; the effects below
  // reach the current ones through a ref, as ClientThreadScreen does.
  const load = useRef({ refreshBalance, loadActivity });
  useEffect(() => { load.current = { refreshBalance, loadActivity }; });

  useEffect(() => {
    load.current.refreshBalance();
    void load.current.loadActivity(1);
  }, []);

  // Back from Stripe: the line stays for as long as the screen is mounted,
  // the address goes back to the plain tab, as /billing does.
  const status = params.get("status");
  const outcome: PaymentOutcome | null = status === "success" || status === "error" ? status : null;
  if (outcome && outcome !== payment) setPayment(outcome);
  useEffect(() => {
    if (!outcome) return;
    if (outcome === "success") {
      load.current.refreshBalance();
      void load.current.loadActivity(1);
    }
    navigate(pathname, { replace: true });
  }, [outcome, pathname, navigate]);

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const { rows, state } = activity;

  return (
    <section className="client-you" aria-label="You">
      <header className="client-chats-header">
        <p className="client-chats-eyebrow">Your account</p>
        <h1 className="client-chats-title">You</h1>
      </header>

      <div className="client-you-card client-you-stardust">
        <p className="client-chats-eyebrow">Stardust</p>
        <p className="client-you-figure">{balance ? formatGbp(balance.balance) : "—"}</p>
        <p className="client-you-sub">available for readings</p>
        {payment && <p className={`client-you-payment${payment === "error" ? " is-error" : ""}`} role="status">{PAYMENT_LINES[payment]}</p>}
        <button type="button" className="begin" onClick={() => openTopUp({ returnUrl: `${YOU_PATH}?topup=1` })}>Add Stardust</button>
      </div>

      <section className="client-you-section" aria-label="Recent activity">
        <p className="client-chats-eyebrow">Recent activity</p>
        <div className="client-you-card client-you-activity">
          {rows.length > 0 && <ul className="client-you-rows">{rows.map(row => <ActivityRow key={row.id} row={row} />)}</ul>}
          {state === "ready" && activity.total === 0 && <p className="client-chats-notice">No activity yet.</p>}
          {state === "loading" && <p className="client-chats-notice" role="status">Loading…</p>}
          {state === "error" && <p className="client-chats-notice" role="alert">Could not load activity. <button onClick={() => { void loadActivity(activity.failedPage); }}>Try again</button></p>}
          {state === "ready" && activity.page < activity.pages && (
            <button type="button" className="client-you-pill" onClick={() => { void loadActivity(activity.page + 1); }}>Show more</button>
          )}
        </div>
      </section>

      <section className="client-you-section" aria-label="Account">
        <p className="client-chats-eyebrow">Account</p>
        <div className="client-you-card client-you-account">
          <p className="client-you-name">{user?.username}</p>
          <p className="client-you-email">{user?.email}</p>
          <button type="button" className="client-you-pill client-you-logout" onClick={signOut}>Log out</button>
        </div>
      </section>
    </section>
  );
}

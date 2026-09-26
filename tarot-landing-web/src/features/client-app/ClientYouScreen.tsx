/* The You tab: her Stardust, her recent activity and her account, on the
   shell's living sky. The machinery is the site's own: usePayment for the
   balance and the ledger, the global top-up window (the glider and its
   checkout) for adding Stardust, the auth context for who she is and for
   logging out. The More card leads to the site's own pages hosted in the
   app (the Constellation, Notifications, Terms, Privacy; ClientMoreScreen.tsx),
   its Notifications row carrying the API's unread count
   (useNotificationsUnreadCount.ts), and last, where this browser can do it,
   Add to your home screen (useInstallPrompt.ts). The
   Account card leads to the account screens, Favourites, Edit details and
   Change password, and shows the line one of them sends back; then the
   switch for her reply emails; under its Log out, a quieter Delete account
   (ClientDeleteAccountScreen.tsx). */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks";
import { CURRENT_USER_QUERY_KEY } from "@/features/auth/hooks/useCurrentUser";
import { PER_MESSAGE_COPY } from "@/features/chat/perMessage";
import { TransactionStatus, TransactionType, type Transaction } from "@/features/ledger/types/transaction.types";
import { useTopUp } from "@/features/payment/context/TopUpContext";
import { usePayment } from "@/features/payment/hooks/usePayment";
import { profileApi } from "@/features/profile/api/profileApi";
import { GUIDANCE_LINE } from "@/lib/copy";
import { formatGbp } from "@/lib/currency";
import { readerName } from "./appReaders";
import { YOU_DELETE_PATH, YOU_DETAILS_PATH, YOU_FAVOURITES_PATH, YOU_PASSWORD_PATH, YOU_PATH } from "./clientAppPaths";
import { refusalText, type YouNotice } from "./ClientAccountForm";
import { MORE_LINKS } from "./ClientMoreScreen";
import { badgeText } from "./unreadBadge";
import { clockAt, shortDayOf } from "./ukTime";
import { useClientInbox } from "./useClientInbox";
import { useInstallPrompt } from "./useInstallPrompt";
import { useNotificationsUnreadCount } from "./useNotificationsUnreadCount";
import "./client-chats.css";
import "./client-you.css";

const ACTIVITY_PAGE_SIZE = 10;

/* Money in is gold with a plus, money out is dim with a minus. Every type the
   backend writes is in one of the two sets. */
const INCOMING = new Set<TransactionType>([TransactionType.CREDIT, TransactionType.BONUS, TransactionType.GIFT, TransactionType.REFUND, TransactionType.REVERSAL, TransactionType.EARN]);
const OUTGOING = new Set<TransactionType>([TransactionType.DEBIT, TransactionType.EXPIRE]);
/* The opening words the backend gives an admin's balance change and the
   daily card pull's reward (admin.py, daily_pull.py). */
const ADMIN_ADJUSTMENT = "Admin adjustment";
const DAILY_CARD_PULL = "Daily card pull";

/* The row's title from what the API sends: the type, the description's
   opening words, the Stripe intent, and the reader of the chat a charge
   belongs to, when the inbox cache names her. */
function activityTitle(row: Transaction, reader: string | undefined): string {
  const description = row.description ?? "";
  switch (row.transaction_type) {
    case TransactionType.DEBIT:
      if (description.startsWith(ADMIN_ADJUSTMENT)) return "Adjustment";
      return reader ? `Message to ${reader}` : "Message";
    case TransactionType.CREDIT:
      if (description.startsWith(ADMIN_ADJUSTMENT)) return "Adjustment";
      return row.stripe_payment_intent_id ? "Top-up by card" : "Stardust added";
    case TransactionType.EARN:
      return description.startsWith(DAILY_CARD_PULL) ? "Daily card pull" : "Earned Stardust";
    case TransactionType.EXPIRE:
      return "Earned Stardust faded";
    case TransactionType.REVERSAL:
      // The one writer of REVERSAL is the refund of a message she paid for
      // (transactions.py refund_message): her money back, no reply.
      return PER_MESSAGE_COPY.refund(reader);
    case TransactionType.BONUS:
      return "Welcome credit";
    case TransactionType.GIFT:
      return "Gift";
    case TransactionType.REFUND:
      return "Refund";
    default:
      return "Transfer";
  }
}
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

const ACCOUNT_LINKS = [
  { to: YOU_FAVOURITES_PATH, label: "Favourites" },
  { to: YOU_DETAILS_PATH, label: "Edit details" },
  { to: YOU_PASSWORD_PATH, label: "Change password" },
] as const;

/* The home-screen row and the sheet it opens on an iPhone, where no page can
   open an install dialog, so the sheet names Safari's own two taps. The
   sheet's title is the row's label. */
const INSTALL_COPY = {
  row: "Add to your home screen",
  steps: ["Tap the Share button.", "Tap “Add to Home Screen”."],
  close: "Close",
} as const;

/* One row of a card's list: the label, a count when there is one, and the
   chevron. The count is drawn as the tab bar's badge (client-app.css,
   .client-app-badge), placed in the row's flow. Given onPress instead of a
   path, the same row is a button. */
type YouLinkProps = { label: string; count?: number } & ({ to: string } | { onPress: () => void });
function YouLink({ label, count = 0, ...target }: YouLinkProps) {
  const ariaLabel = count > 0 ? `${label}, ${count} unread` : undefined;
  const content = (
    <>
      {label}
      <span className="client-you-link-end">
        {count > 0 && <span className="client-app-badge" aria-hidden="true">{badgeText(count)}</span>}
        <span className="client-you-link-chevron" aria-hidden="true">›</span>
      </span>
    </>
  );
  if ("onPress" in target) {
    return <button type="button" className="client-you-link" onClick={target.onPress} aria-label={ariaLabel}>{content}</button>;
  }
  return <Link to={target.to} className="client-you-link" aria-label={ariaLabel}>{content}</Link>;
}

/* The one switch for the emails the backend sends her about her
   conversations (services/reply_emails.py): a reader replied, a message was
   refunded. On unless she turns it off. PATCH /profile/me answers with the
   whole profile, which goes into the /profile/me cache, the one source the
   auth context follows (useCurrentUser.ts), as Edit details does. */
const REPLY_EMAILS_LABEL = "Email me when a reader replies";

function ReplyEmailsSwitch() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = user?.reply_emails !== false;
  const toggle = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await profileApi.updateMyProfile({ reply_emails: !on });
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, result);
    } catch (reason) {
      setError(refusalText(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" role="switch" aria-checked={on} className="client-you-link client-you-switch" onClick={toggle} disabled={busy}>
        {REPLY_EMAILS_LABEL}
        <span className="client-you-switch-track" aria-hidden="true"><span className="client-you-switch-thumb" /></span>
      </button>
      {error && <p className="client-you-error client-you-switch-error" role="alert">{error}</p>}
    </>
  );
}

interface Activity {
  rows: Transaction[];
  page: number;
  pages: number;
  total: number;
  state: "loading" | "ready" | "error";
  /** The page a failed request asked for, so Try again asks for it again. */
  failedPage: number;
}

/* One ledger row. The column keeps one precision, pence always, so
   "+£10,000.00" sits over "−£2.50". */
function ActivityRow({ row, reader }: { row: Transaction; reader?: string }) {
  const incoming = INCOMING.has(row.transaction_type);
  const outgoing = OUTGOING.has(row.transaction_type);
  const status = row.status === TransactionStatus.COMPLETED ? null : STATUS_WORDS[row.status] ?? null;
  return (
    <li className="client-you-row" data-transaction-id={row.id}>
      <span className="client-you-row-text">
        <span className="client-you-row-title">{activityTitle(row, reader)}</span>
        <time className="client-you-row-time" dateTime={row.created_at}>
          {`${shortDayOf(row.created_at)} · ${clockAt(row.created_at)}`}{status && ` · ${status}`}
        </time>
      </span>
      <span className={`client-you-amount${incoming ? " is-in" : ""}`}>
        {incoming ? "+" : outgoing ? "−" : ""}{formatGbp(row.amount, { pence: "always" })}
      </span>
    </li>
  );
}

export default function ClientYouScreen() {
  const { user, logout } = useAuth();
  // the API's unread count, the number the Notifications screen's Unread
  // chip shows (useNotificationsUnreadCount.ts)
  const { data: unreadNotifications = 0 } = useNotificationsUnreadCount();
  const { open: openTopUp } = useTopUp();
  const { balance, fetchMyBalance, fetchMyTransactions } = usePayment();
  const navigate = useNavigate();
  const { pathname, state: arrivedWith } = useLocation();
  const [params] = useSearchParams();
  const [payment, setPayment] = useState<PaymentOutcome | null>(null);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
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
  // A cancelled checkout reads as a failed one: nothing was charged.
  const status = params.get("status");
  const outcome: PaymentOutcome | null =
    status === "success" ? "success" : status === "error" || status === "cancelled" ? "error" : null;
  if (outcome && outcome !== payment) setPayment(outcome);
  useEffect(() => {
    if (!outcome) return;
    if (outcome === "success") {
      load.current.refreshBalance();
      void load.current.loadActivity(1);
    }
    navigate(pathname, { replace: true });
  }, [outcome, pathname, navigate]);

  // Back from Edit details or Change password: the line they sent stays for
  // as long as the screen is mounted, the way the payment line does, and the
  // history entry is cleared of it so a reload does not repeat it.
  const notice = (arrivedWith as YouNotice | null)?.notice ?? null;
  if (notice && notice !== accountNotice) setAccountNotice(notice);
  useEffect(() => {
    if (notice) navigate(pathname, { replace: true, state: null });
  }, [notice, pathname, navigate]);

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  // Chrome's own install dialog when the browser offered one, the Share
  // steps on an iPhone, no row at all from the home screen.
  const install = useInstallPrompt();
  const shareSteps = useRef<HTMLDialogElement>(null);
  const pressInstall = () => {
    if (install.route === "prompt") install.prompt();
    else shareSteps.current?.showModal();
  };

  const { rows, state } = activity;
  const moreCounts: Partial<Record<keyof typeof MORE_LINKS, number>> = { notifications: unreadNotifications };

  // The inbox the Chats tab caches names the reader behind each message
  // charge, by the chat the charge belongs to, in the app's Title case.
  const inbox = useClientInbox();
  const readerByChat = new Map<number, string>();
  for (const page of inbox.data?.pages ?? []) {
    for (const item of page.items) readerByChat.set(item.chat_id, readerName({ username: item.reader.display_name }));
  }

  return (
    <section className="client-you" aria-label="You">
      <header className="client-chats-header">
        <p className="client-chats-eyebrow">Your account</p>
        <h1 className="client-chats-title">You</h1>
      </header>

      <div className="client-you-card client-you-stardust">
        <p className="client-chats-eyebrow">Your Stardust</p>
        {/* stardust_total is the displayed Stardust, paid plus earned, the
            field the site header shows (Navbar.tsx:27, transaction.types.ts:75);
            balance alone leaves out what the Constellation awards. */}
        <p className="client-you-figure">{balance ? formatGbp(balance.stardust_total ?? balance.balance) : "—"}</p>
        <p className="client-you-sub">1 Stardust is £1 · spends on messages</p>
        {payment && <p className={`client-you-payment${payment === "error" ? " is-error" : ""}`} role="status">{PAYMENT_LINES[payment]}</p>}
        <button type="button" className="begin" onClick={() => openTopUp({ returnUrl: `${YOU_PATH}?topup=1` })}>Add Stardust</button>
      </div>

      <section className="client-you-section" aria-label="Recent activity">
        <p className="client-chats-eyebrow">Recent activity</p>
        <div className="client-you-card client-you-activity">
          {rows.length > 0 && (
            <ul className="client-you-rows">
              {rows.map(row => <ActivityRow key={row.id} row={row} reader={row.related_chat_id == null ? undefined : readerByChat.get(row.related_chat_id)} />)}
            </ul>
          )}
          {state === "ready" && activity.total === 0 && <p className="client-chats-notice">No activity yet.</p>}
          {state === "loading" && <p className="client-chats-notice" role="status">Loading…</p>}
          {state === "error" && <p className="client-chats-notice" role="alert">Could not load activity. <button onClick={() => { void loadActivity(activity.failedPage); }}>Try again</button></p>}
          {state === "ready" && activity.page < activity.pages && (
            <button type="button" className="client-you-pill" onClick={() => { void loadActivity(activity.page + 1); }}>Show more</button>
          )}
        </div>
      </section>

      <section className="client-you-section" aria-label="More">
        <p className="client-chats-eyebrow">More</p>
        <div className="client-you-card client-you-more">
          <nav className="client-you-links" aria-label="More">
            {(Object.keys(MORE_LINKS) as (keyof typeof MORE_LINKS)[]).map(key => (
              <YouLink key={key} {...MORE_LINKS[key]} count={moreCounts[key]} />
            ))}
            {install.route && <YouLink label={INSTALL_COPY.row} onPress={pressInstall} />}
          </nav>
        </div>
      </section>

      {/* A modal dialog sits in the top layer, over the tab bar. A tap on the
          scrim lands on the dialog itself and closes it; Close and Escape
          close it natively. */}
      {install.route === "share-steps" && (
        <dialog
          ref={shareSteps}
          className="client-you-sheet"
          aria-labelledby="client-you-sheet-title"
          onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
        >
          <div className="client-you-sheet-body">
            <h2 id="client-you-sheet-title" className="client-you-sheet-title">{INSTALL_COPY.row}</h2>
            <ol className="client-you-sheet-steps">
              {INSTALL_COPY.steps.map(step => <li key={step}>{step}</li>)}
            </ol>
            <form method="dialog">
              <button type="submit" className="client-you-pill">{INSTALL_COPY.close}</button>
            </form>
          </div>
        </dialog>
      )}

      <section className="client-you-section" aria-label="Account">
        <p className="client-chats-eyebrow">Account</p>
        <div className="client-you-card client-you-account">
          <p className="client-you-name">{user?.username}</p>
          <p className="client-you-email">{user?.email}</p>
          {accountNotice && <p className="client-you-notice" role="status">{accountNotice}</p>}
          <nav className="client-you-links" aria-label="Account settings">
            {ACCOUNT_LINKS.map(({ to, label }) => <YouLink key={to} to={to} label={label} />)}
          </nav>
          <ReplyEmailsSwitch />
          <button type="button" className="client-you-pill client-you-logout" onClick={signOut}>Log out</button>
          <Link to={YOU_DELETE_PATH} className="client-you-delete">Delete account</Link>
        </div>
      </section>

      <p className="legal">{GUIDANCE_LINE}</p>
    </section>
  );
}

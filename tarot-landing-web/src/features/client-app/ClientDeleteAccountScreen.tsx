/* Delete account, inside the app shell. DELETE /profile/me (profile.py:290-336)
   takes a client account out for good: soft_delete_own_account
   (services/users.py:213-261) renames the email and the name, clears the date
   of birth, bio and photo, sets a random password, sets the paid and free
   balances to 0, suspends the account, and keeps the chats and the ledger
   under the anonymous identity. The screen says that in plain words, with the
   Stardust figure the You tab shows, and asks for DELETE typed out before the
   button wakes. The route refuses while a chat is ACTIVE or PAUSED
   (profile.py:320-332); that refusal reads as one plain line, any other shows
   the backend's own words. On success she is logged out the way Log out does
   it and lands on /login with one line. */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { useToast } from "@/components/Toast/useToast";
import { useAuth } from "@/features/auth/hooks";
import { usePayment } from "@/features/payment/hooks/usePayment";
import { profileApi } from "@/features/profile/api/profileApi";
import { formatGbp } from "@/lib/currency";
import { AccountFrame, refusalText } from "./ClientAccountForm";

const COPY = {
  title: "Delete account",
  closed: "Your account is closed and anonymised. Your name, email address, date of birth, bio and photo are removed from it, and you can no longer sign in.",
  stardust: (amount: string | null) =>
    amount === null ? "Any Stardust left on it is lost. It is not refunded." : `The Stardust left on it, ${amount}, is lost. It is not refunded.`,
  history: "Your chats and payment history are kept under an anonymous identity.",
  final: "This cannot be undone.",
  confirm: "Type DELETE to confirm",
  word: "DELETE",
  submit: "Delete account",
  deleting: "Deleting…",
  readingInProgress: "Finish your reading first, then try again.",
  deleted: "Your account has been deleted.",
} as const;

/* The status the route answers while a reading is in progress (profile.py:328-332). */
const READING_IN_PROGRESS = 409;

export default function ClientDeleteAccountScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const { logout } = useAuth();
  const { balance, fetchMyBalance } = usePayment();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // the You tab's balance request (ClientYouScreen.tsx); usePayment hands
  // back a new function on every render, so the first one is kept
  const loadBalance = useRef(fetchMyBalance);
  useEffect(() => {
    loadBalance.current().catch(() => { /* the line keeps its plain form */ });
  }, []);

  // the You tab's figure: stardust_total, paid plus earned
  const stardust = balance ? formatGbp(balance.stardust_total ?? balance.balance) : null;
  const confirmed = typed.trim() === COPY.word;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !confirmed) return;
    setError(null);
    setBusy(true);
    try {
      await profileApi.deleteMyAccount();
    } catch (reason) {
      setError(isAxiosError(reason) && reason.response?.status === READING_IN_PROGRESS ? COPY.readingInProgress : refusalText(reason));
      setBusy(false);
      return;
    }
    // Log out's own two steps (ClientYouScreen.tsx, signOut)
    logout();
    toast.success(COPY.deleted);
    navigate("/login", { replace: true });
  };

  return (
    <AccountFrame title={COPY.title}>
      <form className="client-you-card client-you-form" onSubmit={submit} noValidate>
        <ul className="client-you-delete-terms">
          <li>{COPY.closed}</li>
          <li>{COPY.stardust(stardust)}</li>
          <li>{COPY.history}</li>
          <li>{COPY.final}</li>
        </ul>
        <div className="client-you-field">
          <label className="client-you-label" htmlFor="you-delete-confirm">{COPY.confirm}</label>
          <input id="you-delete-confirm" className="client-you-input" type="text" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} value={typed} onChange={event => setTyped(event.target.value)} />
        </div>
        {error && <p className="client-you-error" role="alert">{error}</p>}
        <button type="submit" className="client-you-solid" disabled={!confirmed || busy} aria-busy={busy}>{busy ? COPY.deleting : COPY.submit}</button>
      </form>
    </AccountFrame>
  );
}

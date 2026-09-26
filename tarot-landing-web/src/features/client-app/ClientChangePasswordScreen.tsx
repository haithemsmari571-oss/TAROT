/* Change password, inside the app shell. POST /profile/me/change-password
   (profile.py:162-195) has one rule, the current password must match
   (services/auth.py:523-528), and no rule on the new one (schemas/auth.py:81-83),
   so the form asks only for three filled fields and a matching confirmation,
   and shows the backend's own words when it refuses. The passwords live in
   this screen's state while it is mounted and go nowhere else. */
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { profileApi } from "@/features/profile/api/profileApi";
import { YOU_PATH } from "./clientAppPaths";
import { AccountFrame, refusalText, type YouNotice } from "./ClientAccountForm";

const COPY = {
  title: "Change password",
  current: "Current password",
  next: "New password",
  confirm: "Confirm new password",
  submit: "Change password",
  saving: "Changing…",
  empty: "Please fill in all three fields.",
  mismatch: "The new passwords do not match.",
  done: "Password changed.",
} as const;

export default function ClientChangePasswordScreen() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!current || !next || !confirm) { setError(COPY.empty); return; }
    if (next !== confirm) { setError(COPY.mismatch); return; }
    setError(null);
    setBusy(true);
    try {
      await profileApi.changePassword({ current_password: current, new_password: next });
      const state: YouNotice = { notice: COPY.done };
      navigate(YOU_PATH, { replace: true, state });
    } catch (reason) {
      setError(refusalText(reason));
      setBusy(false);
    }
  };

  return (
    <AccountFrame title={COPY.title}>
      <form className="client-you-card client-you-form" onSubmit={submit} noValidate>
        <div className="client-you-field">
          <label className="client-you-label" htmlFor="you-password-current">{COPY.current}</label>
          <input id="you-password-current" className="client-you-input" type="password" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} />
        </div>
        <div className="client-you-field">
          <label className="client-you-label" htmlFor="you-password-next">{COPY.next}</label>
          <input id="you-password-next" className="client-you-input" type="password" autoComplete="new-password" value={next} onChange={event => setNext(event.target.value)} />
        </div>
        <div className="client-you-field">
          <label className="client-you-label" htmlFor="you-password-confirm">{COPY.confirm}</label>
          <input id="you-password-confirm" className="client-you-input" type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} />
        </div>
        {error && <p className="client-you-error" role="alert">{error}</p>}
        <button type="submit" className="client-you-solid" disabled={busy} aria-busy={busy}>{busy ? COPY.saving : COPY.submit}</button>
      </form>
    </AccountFrame>
  );
}

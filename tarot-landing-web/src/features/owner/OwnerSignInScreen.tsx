import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CURRENT_USER_QUERY_KEY, useAuth } from "@/features/auth/hooks";
import { loginRefusal } from "@/features/auth/signInRefusal";
import { saveRefreshToken } from "@/features/auth/utils/tokenStorage";
import { OwnerField } from "./OwnerParts";
import { OWNER_PATH } from "./ownerPaths";
import { OWNER_APP_NAME, OwnerSignInRefused, signInOwner } from "./ownerSession";

const COPY = {
  email: "Email",
  password: "Password",
  signIn: "Sign in",
  signingIn: "Signing in…",
} as const;

/* The owner's own sign-in (ROUND50): email and password, the superadmin only,
   then home at /owner. Never the CRM from here. A refused account keeps no
   token, and a session already stored in this browser is left as it was. */
export default function OwnerSignInScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const signedIn = await signInOwner(email.trim(), password);
      // The global /profile/me reader (useCurrentUser) copies its cached answer
      // into the session; it is given this account's before the session starts.
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, signedIn.user);
      // AuthContext's login also keeps a refresh token it is handed, but its
      // declared type takes two arguments (auth.types.ts:117), so it is stored
      // first, by the same storage module.
      saveRefreshToken(signedIn.refreshToken);
      login(signedIn.token, signedIn.user);
      navigate(OWNER_PATH, { replace: true });
    } catch (reason) {
      setError(reason instanceof OwnerSignInRefused ? reason.message : loginRefusal(reason));
      setBusy(false);
    }
  };

  return (
    <main className="owner-screen owner-sign-in">
      <h1 className="owner-title">{OWNER_APP_NAME}</h1>
      <form className="owner-panel owner-form" onSubmit={submit} noValidate>
        <OwnerField label={COPY.email}>
          <input
            className="owner-input"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
            required
          />
        </OwnerField>
        <OwnerField label={COPY.password}>
          <input
            className="owner-input"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
            required
          />
        </OwnerField>
        {error && <p className="owner-error" role="alert">{error}</p>}
        <button type="submit" className="owner-button" disabled={busy || !email.trim() || !password}>
          {busy ? COPY.signingIn : COPY.signIn}
        </button>
      </form>
    </main>
  );
}

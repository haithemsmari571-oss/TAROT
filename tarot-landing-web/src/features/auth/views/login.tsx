import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { isAxiosError } from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { readerIdFrom, withReader } from "@/features/client-app/readerIntent";
import AuthBackground from "../components/AuthBackground";
import ShowPasswordButton from "../components/ShowPasswordButton";
import { useGlassTheme } from "../../../lib/glassTheme";
import { useLogin } from "../hooks";
import { INCORRECT_CREDENTIALS, loginRefusal } from "../signInRefusal";
import { WEBSITE_SIGN_IN_REFUSED, storedSessionWasRefused } from "../websiteSignIn";
import "../../../styles/glass.css";

// Glass auth shell — shared inline tokens for the guest screens. Everything
// draws from the frozen token sheet (src/styles/glass.css); no hardcoded
// palette except the sanctioned error red #c1443a.
const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--gl-sans)",
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: "var(--gl-text-faint)",
  margin: "0 2px 8px",
};

const inputStyle: React.CSSProperties = {
  padding: "13px 18px",
  fontSize: 14,
};

const errorBoxStyle: React.CSSProperties = {
  border: "1px solid rgba(193, 68, 58, 0.45)",
  background: "rgba(193, 68, 58, 0.1)",
  borderRadius: 16,
  padding: "12px 16px",
  textAlign: "center",
};

const errorTextStyle: React.CSSProperties = {
  fontFamily: "var(--gl-sans)",
  fontSize: 13,
  color: "#c1443a",
  margin: 0,
};

// Each label names its field, and a refusal names the fields it is about (ROUND40).
const EMAIL_ID = "signin-email";
const PASSWORD_ID = "signin-password";
const ERROR_ID = "signin-error";

/** The fields a refusal is about: both for a wrong email or password, the
    email for an address the server cannot read (422), none otherwise. */
function refusedFieldIds(error: unknown): string[] {
  if (!error) return [];
  if (loginRefusal(error) === INCORRECT_CREDENTIALS) return [EMAIL_ID, PASSWORD_ID];
  return isAxiosError(error) && error.response?.status === 422 ? [EMAIL_ID] : [];
}

const successBoxStyle: React.CSSProperties = {
  border: "1px solid var(--gl-live-bd)",
  background: "var(--gl-glass)",
  borderRadius: 16,
  padding: "12px 16px",
  textAlign: "center",
};

const LoginPage = () => {
  useGlassTheme(); // apply the stored candlelight/daylight mood on hard loads
  const [searchParams] = useSearchParams();
  // The reader she chose as a guest, carried on to sign-up (readerIntent.ts).
  const readerId = readerIdFrom(searchParams);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showVerifiedMessage, setShowVerifiedMessage] = useState(false);
  // A reader's or admin's stored session this page load ended (main.tsx) gets
  // the same refusal, until she tries to sign in.
  const [sessionRefused, setSessionRefused] = useState(storedSessionWasRefused);
  const { mutate: login, isPending, error } = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const emailField = useRef<HTMLInputElement>(null);

  // The fields the refusal on show is about are tied to it and marked invalid;
  // the email, first of them, takes focus.
  const badFields = refusedFieldIds(error);
  const errorFor = (id: string) =>
    badFields.includes(id) ? { "aria-invalid": true, "aria-describedby": ERROR_ID } : {};

  useEffect(() => {
    if (refusedFieldIds(error).length > 0) emailField.current?.focus();
  }, [error]);

  const verified = searchParams.get("verified");

  useEffect(() => {
    if (verified === "true") {
      setShowVerifiedMessage(true);
      setTimeout(() => setShowVerifiedMessage(false), 5000);
    }
  }, [verified]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setSessionRefused(false);
    await login({ email, password });
  };

  return (
    // main: the page's landmark (axe landmark-one-main).
    <main
      className="relative min-h-screen w-full flex items-center justify-center px-4 py-10"
      style={{ backgroundColor: "var(--gl-base)", fontFamily: "var(--gl-sans)" }}
    >
      {/* The app's sky; the token tint carries the mood. */}
      <AuthBackground />

      {/* Back to home */}
      <Link
        to="/"
        aria-label="Back to home"
        className="gl-btn-ghost fixed top-6 left-6 z-20 flex items-center justify-center"
        style={{ width: 44, height: 44, padding: 0, borderRadius: "50%", textDecoration: "none" }}
      >
        <Icon icon="ph:arrow-left-bold" className="text-lg" />
      </Link>

      <div className="relative z-10 w-full" style={{ maxWidth: 440 }}>
        <div
          className="gl-hero-panel--solid"
          style={{ padding: "clamp(30px, 5vw, 44px) clamp(22px, 5vw, 40px)" }}
        >
          <header className="text-center" style={{ marginBottom: 28 }}>
            <div className="gl-kicker">Ask Valentina</div>
            <h1 className="gl-h2" style={{ marginBottom: 12 }}>
              Welcome <i>back</i>
            </h1>
            <p className="gl-sub" style={{ marginBottom: 0, fontSize: 14 }}>
              Sign in to continue your readings.
            </p>
          </header>

          {showVerifiedMessage && (
            <div style={{ ...successBoxStyle, marginBottom: 20 }}>
              <div className="flex items-center justify-center gap-2">
                <Icon icon="ph:check-circle-bold" className="text-lg" style={{ color: "var(--gl-live)" }} />
                <p style={{ fontFamily: "var(--gl-sans)", fontSize: 13, fontWeight: 600, color: "var(--gl-live-fg)", margin: 0 }}>
                  Account verified — welcome!
                </p>
              </div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleLogin}>
            <div>
              <label htmlFor={EMAIL_ID} style={labelStyle}>Email</label>
              <div className="relative">
                <Icon
                  icon="ph:user-bold"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-base pointer-events-none"
                  style={{ color: "var(--gl-text-faint)" }}
                />
                <input
                  required
                  id={EMAIL_ID}
                  ref={emailField}
                  type="email"
                  name="email"
                  autoComplete="username"
                  placeholder="you@email.com"
                  className="gl-pop-input"
                  style={{ ...inputStyle, paddingLeft: 46 }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  {...errorFor(EMAIL_ID)}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-baseline" style={{ margin: "0 2px 8px" }}>
                <label htmlFor={PASSWORD_ID} style={{ ...labelStyle, margin: 0 }}>Password</label>
                <Link
                  to="/forgot-password"
                  className="gl-acc hover:underline"
                  style={{ fontFamily: "var(--gl-sans)", fontSize: 11, fontWeight: 600, letterSpacing: "1px" }}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Icon
                  icon="ph:lock-key-bold"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-base pointer-events-none"
                  style={{ color: "var(--gl-text-faint)" }}
                />
                <input
                  required
                  id={PASSWORD_ID}
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  className="gl-pop-input"
                  style={{ ...inputStyle, paddingLeft: 46, paddingRight: 46 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  {...errorFor(PASSWORD_ID)}
                />
                <ShowPasswordButton shown={showPassword} onToggle={() => setShowPassword((s) => !s)} controls={PASSWORD_ID} />
              </div>
            </div>

            {/* role="alert": read out the moment it appears (ROUND35 A3). */}
            {error ? (
              <div role="alert" style={errorBoxStyle}>
                <p id={ERROR_ID} style={errorTextStyle}>
                  {loginRefusal(error)}
                </p>
              </div>
            ) : (
              sessionRefused && (
                <div role="alert" style={errorBoxStyle}>
                  <p style={errorTextStyle}>{WEBSITE_SIGN_IN_REFUSED}</p>
                </div>
              )
            )}

            <button
              type="submit"
              disabled={isPending}
              className="gl-btn-solid w-full flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
              style={{ padding: "15px 24px", fontSize: 13, letterSpacing: "1.4px", textTransform: "uppercase", marginTop: 26 }}
            >
              {isPending ? (
                <>Signing in… <Icon icon="ph:spinner-gap-bold" className="animate-spin text-lg" /></>
              ) : (
                <>Sign in <Icon icon="ph:arrow-right-bold" /></>
              )}
            </button>
          </form>

          <div className="gl-divider" style={{ margin: "30px 0 24px" }} />

          <div className="text-center">
            <p className="gl-tf" style={{ fontFamily: "var(--gl-sans)", fontSize: 12, letterSpacing: "0.6px", marginBottom: 14 }}>
              New to Ask Valentina?
            </p>
            <Link
              to={withReader("/register", readerId)}
              className="gl-btn-ghost inline-block"
              style={{ textDecoration: "none", padding: "11px 26px" }}
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default LoginPage;

import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import backgroundImage from "../../../assets/Cover.png";
import PageBackground from "../../../components/PageBackground";
import { useGlassTheme } from "../../../lib/glassTheme";
import { useVerifyAccount, useResendVerify } from "../hooks";
import "../../../styles/glass.css";

// Glass auth shell — shared inline tokens for the guest screens. Everything
// draws from the frozen token sheet (src/styles/glass.css); no hardcoded
// palette except the sanctioned error red #c1443a.
const inputStyle: React.CSSProperties = {
  padding: "13px 18px",
  fontSize: 14,
};

const errorBoxStyle: React.CSSProperties = {
  border: "1px solid rgba(193, 68, 58, 0.45)",
  background: "rgba(193, 68, 58, 0.1)",
  borderRadius: 16,
  padding: "24px 20px",
  textAlign: "center",
};

const successBoxStyle: React.CSSProperties = {
  border: "1px solid var(--gl-live-bd)",
  background: "var(--gl-glass)",
  borderRadius: 16,
  padding: "24px 20px",
  textAlign: "center",
};

const VerifyEmailPage = () => {
  useGlassTheme(); // apply the stored candlelight/daylight mood on hard loads
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const { mutate: verifyAccount, isPending, error, isSuccess } = useVerifyAccount();
  const { mutate: resendVerify, isPending: isResending, isSuccess: resendSuccess } = useResendVerify();

  const status = searchParams.get("status");
  const isSuccessFromQuery = status === "success";

  useEffect(() => {
    if (token && !isSuccessFromQuery) {
      verifyAccount(token);
    }
  }, [token, verifyAccount, isSuccessFromQuery]);

  useEffect(() => {
    if (isSuccessFromQuery) {
      setTimeout(() => {
        window.location.href = "/login?verified=true";
      }, 2000);
    }
  }, [isSuccessFromQuery]);

  const handleResend = (e) => {
    e.preventDefault();
    resendVerify(email);
  };

  // ── Which state to show ─────────────────────────────────────────────────────
  // The backend redirects the email link here as /verify-account?status=success
  // or ?status=error&message=<ExceptionClassName>. We deliberately IGNORE that
  // raw `message` (and the token mutation's raw `detail`) — those carry internal
  // codes like "InvalidResetLink" that leak the password-reset flow's wording
  // into email verification. Verification errors always show verification copy.
  const isErrorFromQuery = status === "error";
  const emailDisplay = searchParams.get("email") || email || "your inbox";

  const showSuccess = isSuccess || isSuccessFromQuery;
  const showError = !!error || isErrorFromQuery;
  const showVerifying = isPending || (!!token && !showSuccess && !showError);
  const showShell = !showVerifying && !showSuccess && !showError;

  const headerTitle = showSuccess
    ? { lead: "Email", accent: "verified" }
    : showError
    ? { lead: "Link", accent: "expired" }
    : showVerifying
    ? { lead: "Verifying", accent: "account" }
    : { lead: "Check your", accent: "email" };

  const headerBody = showSuccess
    ? "Your email is verified — you can now sign in."
    : showError
    ? "That verification link didn't work — let's get you a new one."
    : showVerifying
    ? "Just a moment while we verify your email…"
    : `We've sent a verification link to ${emailDisplay}. Open that email and click the link to activate your account — you won't be able to sign in until you do.`;

  // Shared resend-email form. `variant` controls prominence: "primary" for the
  // error state (the main recovery action there) and "secondary" for the shell
  // state, where "Sign in" is now the primary action and resend sits below it.
  const renderResendForm = (variant: "primary" | "secondary") =>
    resendSuccess ? (
      <div style={{ ...successBoxStyle, padding: "12px 16px" }}>
        <p style={{ fontFamily: "var(--gl-sans)", fontSize: 13, fontWeight: 500, color: "var(--gl-live-fg)", margin: 0 }}>
          Verification email sent — check your inbox.
        </p>
      </div>
    ) : (
      <form onSubmit={handleResend} className="space-y-4">
        <div className="relative">
          <Icon
            icon="ph:envelope-simple-bold"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-base pointer-events-none"
            style={{ color: "var(--gl-text-faint)" }}
          />
          <input
            required
            type="email"
            placeholder="you@email.com"
            className="gl-pop-input"
            style={{ ...inputStyle, paddingLeft: 46 }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={isResending}
          className={
            variant === "primary"
              ? "gl-btn-solid w-full flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
              : "gl-btn-ghost w-full flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
          }
          style={
            variant === "primary"
              ? { padding: "15px 24px", fontSize: 13, letterSpacing: "1.4px", textTransform: "uppercase" }
              : { padding: "12px 24px" }
          }
        >
          {isResending ? (
            <>Sending… <Icon icon="ph:spinner-gap-bold" className="animate-spin" /></>
          ) : (
            <>Resend verification email <Icon icon="ph:paper-plane-tilt-bold" /></>
          )}
        </button>
      </form>
    );

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center px-4 py-10"
      style={{ backgroundColor: "var(--gl-base)", fontFamily: "var(--gl-sans)" }}
    >
      {/* The cover art stays vivid in both moods; the token tint carries mood. */}
      <PageBackground images={backgroundImage} variant="glass" />

      <div className="relative z-10 w-full" style={{ maxWidth: 440 }}>
        <div
          className="gl-hero-panel--solid"
          style={{ padding: "clamp(30px, 5vw, 44px) clamp(22px, 5vw, 40px)" }}
        >
          <header className="text-center" style={{ marginBottom: 28 }}>
            <div className="gl-kicker">Ask Valentina</div>
            <h1 className="gl-h2" style={{ marginBottom: 12 }}>
              {headerTitle.lead} <i>{headerTitle.accent}</i>
            </h1>
            <p className="gl-sub" style={{ marginBottom: 0, fontSize: 14 }}>
              {headerBody}
            </p>
          </header>

          {showVerifying ? (
            <div className="gl-state" style={{ padding: "24px 0 8px" }}>
              <Icon icon="ph:spinner-gap-bold" className="animate-spin text-5xl mx-auto" style={{ color: "var(--gl-accent)" }} />
              <p style={{ marginTop: 18, marginBottom: 0 }}>Verifying your account…</p>
            </div>
          ) : showSuccess ? (
            <div className="space-y-4" style={successBoxStyle}>
              <Icon icon="ph:check-circle-bold" className="text-5xl mx-auto" style={{ color: "var(--gl-live)" }} />
              <div>
                <h3
                  className="gl-h3"
                  style={{ fontSize: 20, color: "var(--gl-live-fg)", marginBottom: 8 }}
                >
                  Email verified
                </h3>
                <p className="gl-td" style={{ fontFamily: "var(--gl-sans)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                  Your email is verified — you can now sign in to your account.
                </p>
              </div>
              <Link
                to="/login?verified=true"
                className="gl-btn-ghost inline-block"
                style={{ textDecoration: "none", padding: "11px 26px" }}
              >
                Sign in
              </Link>
            </div>
          ) : showError ? (
            <div className="space-y-6">
              <div className="space-y-4" style={errorBoxStyle}>
                <Icon icon="ph:warning-circle-bold" className="text-5xl mx-auto" style={{ color: "#c1443a" }} />
                <div>
                  <h3
                    className="gl-h3"
                    style={{ fontSize: 20, color: "#c1443a", marginBottom: 8 }}
                  >
                    Verification failed
                  </h3>
                  <p className="gl-td" style={{ fontFamily: "var(--gl-sans)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                    This verification link is invalid or has expired. Please check your email for the most recent link, or request a new one below.
                  </p>
                </div>
              </div>

              <div>
                <div className="gl-divider" style={{ marginBottom: 20 }} />
                <p className="gl-td" style={{ fontFamily: "var(--gl-sans)", fontSize: 12.5, textAlign: "center", marginBottom: 14 }}>
                  Need a new verification link?
                </p>
                {renderResendForm("primary")}
              </div>
            </div>
          ) : showShell ? (
            <div className="space-y-6">
              {/* Primary action: signing in (for anyone who's already verified). */}
              <Link
                to="/login"
                className="gl-btn-solid w-full flex items-center justify-center gap-2"
                style={{ padding: "15px 24px", fontSize: 13, letterSpacing: "1.4px", textTransform: "uppercase", textDecoration: "none" }}
              >
                Already verified? Sign in <Icon icon="ph:arrow-right-bold" />
              </Link>

              {/* Secondary action: resend the verification email. */}
              <div>
                <div className="gl-divider" style={{ marginBottom: 20 }} />
                <p className="gl-td" style={{ fontFamily: "var(--gl-sans)", fontSize: 12.5, textAlign: "center", marginBottom: 14 }}>
                  Didn't get the email? Enter your address to send it again.
                </p>
                {renderResendForm("secondary")}
              </div>
            </div>
          ) : null}

          {!showShell && (
            <div className="text-center" style={{ marginTop: 28 }}>
              <div className="gl-divider" style={{ marginBottom: 20 }} />
              <Link
                to="/login"
                className="inline-block"
                style={{ fontFamily: "var(--gl-sans)", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.6px", color: "var(--gl-text-dim)", transition: "color 0.25s" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--gl-accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--gl-text-dim)"; }}
              >
                Already verified? Sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;

import { useState } from "react";
import { Icon } from "@iconify/react";
import { Link, useParams } from "react-router-dom";
import backgroundImage from "../../../assets/Cover.png";
import PageBackground from "../../../components/PageBackground";
import { useGlassTheme } from "../../../lib/glassTheme";
import { useResetPassword } from "../hooks";
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

const successBoxStyle: React.CSSProperties = {
  border: "1px solid var(--gl-live-bd)",
  background: "var(--gl-glass)",
  borderRadius: 16,
  padding: "24px 20px",
  textAlign: "center",
};

const ResetPasswordPage = () => {
  useGlassTheme(); // apply the stored candlelight/daylight mood on hard loads
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const { mutate: resetPassword, isPending, error, isSuccess } = useResetPassword();

  const handleSubmit = (e) => {
    e.preventDefault();
    setPasswordError("");

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }

    if (!token) {
      setPasswordError("Invalid reset token");
      return;
    }

    resetPassword({ reset_token: token, new_password: password });
  };

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
              Choose a new <i>password</i>
            </h1>
            <p className="gl-sub" style={{ marginBottom: 0, fontSize: 14 }}>
              Enter your new password to regain access to your account.
            </p>
          </header>

          {isSuccess ? (
            <div className="space-y-4" style={successBoxStyle}>
              <Icon icon="ph:check-circle-bold" className="text-5xl mx-auto" style={{ color: "var(--gl-live)" }} />
              <div>
                <h3
                  className="gl-h3"
                  style={{ fontSize: 20, color: "var(--gl-live-fg)", marginBottom: 8 }}
                >
                  Password reset successful
                </h3>
                <p className="gl-td" style={{ fontFamily: "var(--gl-sans)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                  Your password has been updated. You can now login with your new credentials.
                </p>
              </div>
              <Link
                to="/login"
                className="gl-btn-ghost inline-block"
                style={{ textDecoration: "none", padding: "11px 26px" }}
              >
                Go to Login
              </Link>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label style={labelStyle}>New Password</label>
                <div className="relative">
                  <Icon
                    icon="ph:lock-key-bold"
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-base pointer-events-none"
                    style={{ color: "var(--gl-text-faint)" }}
                  />
                  <input
                    required
                    type="password"
                    placeholder="••••••••••••"
                    className="gl-pop-input"
                    style={{ ...inputStyle, paddingLeft: 46 }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Confirm Password</label>
                <div className="relative">
                  <Icon
                    icon="ph:lock-key-bold"
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-base pointer-events-none"
                    style={{ color: "var(--gl-text-faint)" }}
                  />
                  <input
                    required
                    type="password"
                    placeholder="••••••••••••"
                    className="gl-pop-input"
                    style={{ ...inputStyle, paddingLeft: 46 }}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              {(passwordError || error) && (
                <div style={errorBoxStyle}>
                  <p style={errorTextStyle}>
                    {passwordError || error?.response?.data?.detail || "Failed to reset password"}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="gl-btn-solid w-full flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
                style={{ padding: "15px 24px", fontSize: 13, letterSpacing: "1.4px", textTransform: "uppercase", marginTop: 26 }}
              >
                {isPending ? (
                  <>Updating... <Icon icon="ph:spinner-gap-bold" className="animate-spin text-lg" /></>
                ) : (
                  <>Reset Password <Icon icon="ph:arrow-right-bold" /></>
                )}
              </button>
            </form>
          )}

          <div className="gl-divider" style={{ margin: "30px 0 24px" }} />

          <div className="text-center">
            <p className="gl-tf" style={{ fontFamily: "var(--gl-sans)", fontSize: 12, letterSpacing: "0.6px", marginBottom: 14 }}>
              Remembered your password?
            </p>
            <Link
              to="/login"
              className="gl-btn-ghost inline-block"
              style={{ textDecoration: "none", padding: "11px 26px" }}
            >
              Return to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;

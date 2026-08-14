import { useState } from "react";
import { Icon } from "@iconify/react";
import { Link, useNavigate } from "react-router-dom";
import backgroundImage from "../../../assets/Cover.png";
import PageBackground from "../../../components/PageBackground";
import { useGlassTheme } from "../../../lib/glassTheme";
import { useRegister } from "../hooks";
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

const RegisterPage = () => {
  const { theme } = useGlassTheme(); // stored mood on hard loads + date-picker scheme
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  // Today, "YYYY-MM-DD" — caps the date picker so a future DOB can't be picked.
  const today = new Date().toISOString().split("T")[0];
  const { mutate: register, isPending, error } = useRegister();
  const navigate = useNavigate();

  const handleRegister = (e) => {
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

    if (dateOfBirth && dateOfBirth > today) {
      setPasswordError("Date of birth cannot be in the future");
      return;
    }

    register(
      { username, email, password, date_of_birth: dateOfBirth },
      {
        // Send new signups to the redesigned "Check your email" page instead of
        // an inline panel; pass the email so it can be shown there.
        onSuccess: () =>
          navigate(`/verify-account?email=${encodeURIComponent(email)}`),
      }
    );
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
          <header className="text-center" style={{ marginBottom: 26 }}>
            <div className="gl-kicker">Ask Valentina</div>
            <h1 className="gl-h2" style={{ marginBottom: 12 }}>
              Create your <i>account</i>
            </h1>
            <p className="gl-sub" style={{ marginBottom: 10, fontSize: 14 }}>
              Join Ask Valentina to connect with a gifted reader.
            </p>
            <p
              className="flex items-center justify-center gap-1.5"
              style={{ fontFamily: "var(--gl-sans)", fontSize: 13, fontWeight: 600, color: "var(--gl-accent)", margin: 0 }}
            >
              <Icon icon="ph:sparkle-fill" />
              Your first reading is on us — £15 free credit.
            </p>
          </header>

          <form className="space-y-4" onSubmit={handleRegister}>
            <div>
              <label style={labelStyle}>Username</label>
              <div className="relative">
                <Icon
                  icon="ph:identification-card-bold"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-base pointer-events-none"
                  style={{ color: "var(--gl-text-faint)" }}
                />
                <input
                  required
                  type="text"
                  placeholder="Your name"
                  className="gl-pop-input"
                  style={{ ...inputStyle, paddingLeft: 46 }}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Email</label>
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
            </div>

            <div>
              <label className="flex items-baseline gap-2" style={labelStyle}>
                Date of birth
                <span style={{ fontSize: 9.5, letterSpacing: "1px", color: "var(--gl-accent)" }}>
                  For astrology
                </span>
              </label>
              <div className="relative">
                <Icon
                  icon="ph:cake-bold"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-base pointer-events-none"
                  style={{ color: "var(--gl-text-faint)" }}
                />
                <input
                  required
                  type="date"
                  max={today}
                  className="gl-pop-input"
                  style={{ ...inputStyle, paddingLeft: 46, colorScheme: theme }}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>Password</label>
                <input
                  required
                  type="password"
                  placeholder="••••••"
                  className="gl-pop-input"
                  style={inputStyle}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>Confirm password</label>
                <input
                  required
                  type="password"
                  placeholder="••••••"
                  className="gl-pop-input"
                  style={inputStyle}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            {(passwordError || error) && (
              <div style={errorBoxStyle}>
                <p style={errorTextStyle}>
                  {passwordError || error?.response?.data?.message}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="gl-btn-solid w-full flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
              style={{ padding: "15px 24px", fontSize: 13, letterSpacing: "1.4px", textTransform: "uppercase", marginTop: 22 }}
            >
              {isPending ? (
                <>Processing... <Icon icon="ph:spinner-gap-bold" className="animate-spin text-lg" /></>
              ) : (
                <>Create account <Icon icon="ph:user-plus-bold" /></>
              )}
            </button>
          </form>

          <div className="gl-divider" style={{ margin: "28px 0 22px" }} />

          <div className="text-center">
            <p className="gl-tf" style={{ fontFamily: "var(--gl-sans)", fontSize: 12, letterSpacing: "0.6px", marginBottom: 14 }}>
              Already have an account?
            </p>
            <Link
              to="/login"
              className="gl-btn-ghost inline-block"
              style={{ textDecoration: "none", padding: "11px 26px" }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;

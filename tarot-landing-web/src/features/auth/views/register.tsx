import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { isAxiosError } from "axios";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { REFUSAL_FALLBACK, serverRefusal } from "@/lib/serverRefusal";
import { usePsychicDetails } from "@/features/browse/hooks/usePsychicDetails";
import { readerName } from "@/features/client-app/appReaders";
import { readerIdFrom, withReader } from "@/features/client-app/readerIntent";
import AuthBackground from "../components/AuthBackground";
import ShowPasswordButton from "../components/ShowPasswordButton";
import { GUIDANCE_LINE } from "../../../lib/copy";
import { formatGbp } from "../../../lib/currency";
import { useGlassTheme } from "../../../lib/glassTheme";
import { FIRST_READING_ON_US, hasWelcomeCredit, useWelcomeCredit } from "../../client-app/useWelcomeCredit";
import { useLogin, useRegister } from "../hooks";
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

const agreeStyle: React.CSSProperties = {
  fontFamily: "var(--gl-sans)",
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--gl-text-dim)",
  margin: "4px 2px 0",
};

const agreeLinkStyle: React.CSSProperties = {
  color: "var(--gl-accent)",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  fontFamily: "inherit",
};

// The small gold note inside a label ("For astrology"). fontFamily inherit: it
// named no face, so App.css's `*` Poppins (never loaded) drew it in Arial.
const labelNoteStyle: React.CSSProperties = {
  fontSize: 9.5,
  letterSpacing: "1px",
  color: "var(--gl-accent)",
  fontFamily: "inherit",
};

// Each label names its field, and an error names the fields it is about (ROUND40).
const FIELD_ID = {
  username: "signup-username",
  email: "signup-email",
  dob: "signup-dob",
  gender: "signup-gender",
  password: "signup-password",
  confirm: "signup-confirm",
} as const;
type SignUpField = keyof typeof FIELD_ID;
const ERROR_ID = "signup-error";
// A schema refusal (422) names its field last in each line's loc.
const SERVER_FIELD: Record<string, SignUpField> = {
  username: "username",
  email: "email",
  date_of_birth: "dob",
  gender: "gender",
  password: "password",
};

/** The fields a server refusal is about: a schema refusal's own fields, or the
    ones its words name ("User with that username or email already exist"). */
function refusedFields(error: unknown): SignUpField[] {
  if (!isAxiosError(error)) return [];
  const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const loc = (item as { loc?: unknown[] } | null)?.loc;
        return Array.isArray(loc) ? SERVER_FIELD[String(loc[loc.length - 1])] : undefined;
      })
      .filter((field): field is SignUpField => field !== undefined);
  }
  const words = (serverRefusal(error) ?? "").toLowerCase();
  return (["username", "email"] as const).filter((field) => words.includes(field));
}

const guidanceStyle: React.CSSProperties = {
  fontFamily: "var(--gl-sans)",
  fontSize: 11.5,
  letterSpacing: "0.4px",
  margin: "14px 0 0",
};

// Ask Valentina is for adults. The server refuses the same date in the same
// words (TAROT-BACKEND app/schemas/user.py MINIMUM_AGE, UNDER_MINIMUM_AGE).
const MINIMUM_AGE = 18;
const UNDER_MINIMUM_AGE = `You must be ${MINIMUM_AGE} or over`;
// Under the heading when she arrives from a reader's START READING (ROUND38).
const startWithReader = (name: string) => `Create your account to start your reading with ${name}.`;

/** True until her 18th birthday, counted in whole birthdays from "YYYY-MM-DD". */
function isUnderMinimumAge(dateOfBirth: string, now = new Date()): boolean {
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const beforeBirthday = now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day);
  return now.getFullYear() - year - (beforeBirthday ? 1 : 0) < MINIMUM_AGE;
}

const RegisterPage = () => {
  const { theme } = useGlassTheme(); // stored mood on hard loads + date-picker scheme
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  // No pre-selection. A default here would quietly answer for her, which is the whole
  // problem this field exists to fix.
  const [gender, setGender] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  // The field a check on this page refused, and whether each password is shown.
  const [badField, setBadField] = useState<SignUpField | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const fields = useRef<Partial<Record<SignUpField, HTMLInputElement | HTMLButtonElement | null>>>({});
  // Her own tick, never pre-ticked; the form cannot be sent without it.
  const [acceptTerms, setAcceptTerms] = useState(false);
  // Today, "YYYY-MM-DD" — caps the date picker so a future DOB can't be picked.
  const today = new Date().toISOString().split("T")[0];
  const { mutate: register, isPending, error } = useRegister();
  // Signed in at once with what she has just typed (EmailConfirm=A: the
  // email is confirmed later, before her second message or first top-up).
  const { mutate: signInNow, isPending: signingIn } = useLogin({ afterSignUp: true });
  const navigate = useNavigate();
  const welcomeCreditGbp = useWelcomeCredit();
  // The reader she chose as a guest (readerIntent.ts), named under the heading.
  const [searchParams] = useSearchParams();
  const readerId = readerIdFrom(searchParams);
  const { data: chosenReader } = usePsychicDetails(readerId ?? undefined);

  // The fields the error on show is about: tied to it (aria-describedby) and
  // marked invalid, and the first of them takes focus.
  const badFields: SignUpField[] = passwordError ? (badField ? [badField] : []) : refusedFields(error);
  const errorFor = (field: SignUpField) =>
    badFields.includes(field) ? { "aria-invalid": true, "aria-describedby": ERROR_ID } : {};

  useEffect(() => {
    const [first] = refusedFields(error);
    if (first) fields.current[first]?.focus();
  }, [error]);

  const refuse = (message: string, field: SignUpField) => {
    setPasswordError(message);
    setBadField(field);
    fields.current[field]?.focus();
  };

  const handleRegister = (e) => {
    e.preventDefault();
    setPasswordError("");
    setBadField(null);

    if (password !== confirmPassword) {
      refuse("Passwords do not match", "confirm");
      return;
    }

    if (password.length < 6) {
      refuse("Password must be at least 6 characters", "password");
      return;
    }

    if (dateOfBirth && dateOfBirth > today) {
      refuse("Date of birth cannot be in the future", "dob");
      return;
    }

    if (dateOfBirth && isUnderMinimumAge(dateOfBirth)) {
      refuse(UNDER_MINIMUM_AGE, "dob");
      return;
    }

    if (!gender) {
      refuse("Please choose an option for gender", "gender");
      return;
    }

    register(
      { username, email, password, date_of_birth: dateOfBirth, gender, accept_terms: acceptTerms },
      {
        // She is let in at once and lands in her reader's thread, or the
        // app's Home (useLogin.ts). Should that sign-in fail, the account
        // exists: the sign-in page takes over, her reader still carried.
        onSuccess: () =>
          signInNow(
            { email, password },
            { onError: () => navigate(withReader("/login", readerId)) }
          ),
      }
    );
  };

  return (
    // main: the page's landmark (axe landmark-one-main).
    <main
      className="relative min-h-screen w-full flex items-center justify-center px-4 py-10"
      style={{ backgroundColor: "var(--gl-base)", fontFamily: "var(--gl-sans)" }}
    >
      {/* The app's sky; the token tint carries the mood. */}
      <AuthBackground />

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
              {chosenReader ? startWithReader(readerName(chosenReader)) : "Join Ask Valentina to connect with a gifted reader."}
            </p>
            {hasWelcomeCredit(welcomeCreditGbp) && (
              <p
                className="flex items-center justify-center gap-1.5"
                style={{ fontFamily: "var(--gl-sans)", fontSize: 13, fontWeight: 600, color: "var(--gl-accent)", margin: 0 }}
              >
                <Icon icon="ph:sparkle-fill" />
                {FIRST_READING_ON_US} — {formatGbp(welcomeCreditGbp)} free credit.
              </p>
            )}
          </header>

          <form className="space-y-4" onSubmit={handleRegister}>
            <div>
              <label htmlFor={FIELD_ID.username} style={labelStyle}>Username</label>
              <div className="relative">
                <Icon
                  icon="ph:identification-card-bold"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-base pointer-events-none"
                  style={{ color: "var(--gl-text-faint)" }}
                />
                <input
                  required
                  id={FIELD_ID.username}
                  ref={(el) => { fields.current.username = el; }}
                  type="text"
                  autoComplete="nickname"
                  placeholder="Your name"
                  className="gl-pop-input"
                  style={{ ...inputStyle, paddingLeft: 46 }}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  {...errorFor("username")}
                />
              </div>
            </div>

            <div>
              <label htmlFor={FIELD_ID.email} style={labelStyle}>Email</label>
              <div className="relative">
                <Icon
                  icon="ph:envelope-simple-bold"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-base pointer-events-none"
                  style={{ color: "var(--gl-text-faint)" }}
                />
                <input
                  required
                  id={FIELD_ID.email}
                  ref={(el) => { fields.current.email = el; }}
                  type="email"
                  autoComplete="email"
                  placeholder="you@email.com"
                  className="gl-pop-input"
                  style={{ ...inputStyle, paddingLeft: 46 }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  {...errorFor("email")}
                />
              </div>
            </div>

            <div>
              <label htmlFor={FIELD_ID.dob} className="flex items-baseline gap-2" style={labelStyle}>
                Date of birth
                <span style={labelNoteStyle}>
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
                  id={FIELD_ID.dob}
                  ref={(el) => { fields.current.dob = el; }}
                  type="date"
                  autoComplete="bday"
                  max={today}
                  className="gl-pop-input"
                  style={{ ...inputStyle, paddingLeft: 46, colorScheme: theme }}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  {...errorFor("dob")}
                />
              </div>
            </div>

            {/* Gender — same step as the date of birth, because it is the same kind of fact:
                something the reader is told rather than left to work out.
                The four choices are one group, named by this label. */}
            <div>
              <label id={`${FIELD_ID.gender}-label`} style={labelStyle} className="flex items-center justify-between">
                Gender
                <span style={labelNoteStyle}>
                  So your reader never has to guess
                </span>
              </label>
              <div
                role="group"
                aria-labelledby={`${FIELD_ID.gender}-label`}
                aria-describedby={badFields.includes("gender") ? ERROR_ID : undefined}
                className="grid grid-cols-2 gap-2"
              >
                {[
                  { value: "WOMAN", label: "Woman" },
                  { value: "MAN", label: "Man" },
                  { value: "OTHER", label: "Other" },
                  { value: "NOT_STATED", label: "Prefer not to say" },
                ].map((option, index) => {
                  const selected = gender === option.value;
                  return (
                    <button
                      key={option.value}
                      ref={index === 0 ? (el) => { fields.current.gender = el; } : undefined}
                      type="button"
                      onClick={() => setGender(option.value)}
                      aria-pressed={selected}
                      className="gl-pop-input"
                      style={{
                        ...inputStyle,
                        textAlign: "center",
                        cursor: "pointer",
                        borderColor: selected ? "var(--gl-accent)" : undefined,
                        color: selected ? "var(--gl-accent)" : undefined,
                        fontWeight: selected ? 700 : undefined,
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={FIELD_ID.password} style={labelStyle}>Password</label>
                <div className="relative">
                  <input
                    required
                    id={FIELD_ID.password}
                    ref={(el) => { fields.current.password = el; }}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••"
                    className="gl-pop-input"
                    style={{ ...inputStyle, paddingRight: 46 }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    {...errorFor("password")}
                  />
                  <ShowPasswordButton shown={showPassword} onToggle={() => setShowPassword((s) => !s)} controls={FIELD_ID.password} />
                </div>
              </div>
              <div>
                <label htmlFor={FIELD_ID.confirm} style={labelStyle}>Confirm password</label>
                <div className="relative">
                  <input
                    required
                    id={FIELD_ID.confirm}
                    ref={(el) => { fields.current.confirm = el; }}
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••"
                    className="gl-pop-input"
                    style={{ ...inputStyle, paddingRight: 46 }}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    {...errorFor("confirm")}
                  />
                  <ShowPasswordButton shown={showConfirm} onToggle={() => setShowConfirm((s) => !s)} controls={FIELD_ID.confirm} />
                </div>
              </div>
            </div>

            {/* role="alert": read out the moment it appears (ROUND35 A3). */}
            {(passwordError || error) && (
              <div role="alert" style={errorBoxStyle}>
                <p id={ERROR_ID} style={errorTextStyle}>
                  {passwordError || serverRefusal(error) || REFUSAL_FALLBACK}
                </p>
              </div>
            )}

            {/* Required: the browser will not send the form until she ticks it.
                The pages open in a new tab so nothing she typed is lost. */}
            <label className="flex items-start gap-2.5" style={{ ...agreeStyle, cursor: "pointer" }}>
              <input
                required
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: "var(--gl-accent)" }}
              />
              <span style={{ fontFamily: "inherit" }}>
                I agree to the{" "}
                <Link to="/terms" target="_blank" rel="noreferrer" style={agreeLinkStyle}>Terms</Link>
                {" "}and the{" "}
                <Link to="/privacy" target="_blank" rel="noreferrer" style={agreeLinkStyle}>Privacy Policy</Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={isPending || signingIn}
              className="gl-btn-solid w-full flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
              style={{ padding: "15px 24px", fontSize: 13, letterSpacing: "1.4px", textTransform: "uppercase", marginTop: 22 }}
            >
              {isPending || signingIn ? (
                <>Processing... <Icon icon="ph:spinner-gap-bold" className="animate-spin text-lg" /></>
              ) : (
                <>Create account <Icon icon="ph:user-plus-bold" /></>
              )}
            </button>
            <p className="gl-tf text-center" style={guidanceStyle}>{GUIDANCE_LINE}</p>
          </form>

          <div className="gl-divider" style={{ margin: "28px 0 22px" }} />

          <div className="text-center">
            <p className="gl-tf" style={{ fontFamily: "var(--gl-sans)", fontSize: 12, letterSpacing: "0.6px", marginBottom: 14 }}>
              Already have an account?
            </p>
            <Link
              to={withReader("/login", readerId)}
              className="gl-btn-ghost inline-block"
              style={{ textDecoration: "none", padding: "11px 26px" }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default RegisterPage;

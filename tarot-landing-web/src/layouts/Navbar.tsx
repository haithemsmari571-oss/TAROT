import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { useAuth } from "../features/auth/hooks";
import { paymentApi } from "../features/payment/api/paymentApi";
import { NotificationBell } from "../features/notifications/components/NotificationBell";
import { formatGbp, formatStardust } from "../lib/currency";
import { useGlassTheme } from "../lib/glassTheme";
import { UserRole } from "../features/auth/types/auth.types";
import { HOME_PATH } from "../features/client-app/clientAppPaths";
import { hasWelcomeCredit, useWelcomeCredit } from "../features/client-app/useWelcomeCredit";
import { FOCUSABLE } from "../features/payment/context/TopUpContext";
import { SUPPORT_MAILTO } from "../lib/company";
import "../styles/glass.css";

const MOBILE_MENU_ID = "mobile-menu";
// The drawer's labels name no face of their own, so App.css's `*` Poppins
// (never loaded) drew them in Arial; they take the glass sans (ROUND35 V1).
const DRAWER_LABEL_FONT = "var(--gl-sans)";

export default function Navbar({ topOffset = 0 }: { topOffset?: number } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const { theme, toggleTheme } = useGlassTheme();
  // The theme toggle shows only ☀ or ☾; these words are its name to a screen
  // reader as well as its tooltip (ROUND31, C2).
  const themeToggleLabel = theme === "dark" ? "Switch to daylight" : "Switch to candlelight";
  const welcomeCreditGbp = useWelcomeCredit();

  const [balance, setBalance] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);

  // The open drawer is a dialog, as the top-up window is (TopUpContext.tsx,
  // ROUND41): focus moves in (Close), Tab and Shift+Tab stay inside, Escape
  // closes it, and focus goes back to the Menu button however it closes.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const stops = () =>
      [...(drawer.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.getClientRects().length > 0);
    stops()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNavOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const all = stops();
      if (all.length === 0) return;
      const first = all[0];
      const last = all[all.length - 1];
      const inside = drawer.current?.contains(document.activeElement) ?? false;
      if (event.shiftKey ? !inside || document.activeElement === first : !inside || document.activeElement === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      menuButton.current?.focus();
    };
  }, [mobileNavOpen]);

  // Sync internal layout balance with background ledger fetches
  useEffect(() => {
    if (isAuthenticated) {
      paymentApi.getMyBalance()
        .then(data => setBalance(data.stardust_total ?? data.balance))
        .catch(() => setBalance(null));
    }
  }, [isAuthenticated, location.pathname]);

  // Keep the header Stardust total live. The pathname-only refetch above goes
  // stale during a reading (route doesn't change while the meter debits every
  // second). ClientChat's session-time sync emits `stardust:balance` with the
  // live credit+paid total; also re-fetch when the tab regains focus.
  useEffect(() => {
    if (!isAuthenticated) return;

    const onBalanceEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === 'number' && !Number.isNaN(detail)) {
        setBalance(detail);
      }
    };
    const onFocus = () => {
      paymentApi.getMyBalance()
        .then(data => setBalance(data.stardust_total ?? data.balance))
        .catch(() => {});
    };

    window.addEventListener('stardust:balance', onBalanceEvent as EventListener);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('stardust:balance', onBalanceEvent as EventListener);
      window.removeEventListener('focus', onFocus);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // A signed-in client's front door is the app: its item comes first and is
  // always drawn as the current one. Guests and the other roles keep theirs.
  const isClient = isAuthenticated && user?.role === UserRole.USER;
  const navItems: { name: string; path: string; primary?: boolean }[] = isClient ? [
    { name: "Open the app", path: HOME_PATH, primary: true },
    { name: "Sanctuary", path: "/sanctuary" },
    { name: "Articles", path: "/articles/" },
    { name: "Life Path & Zodiac", path: "/oracle" },
  ] : [
    { name: "Sanctuary", path: "/sanctuary" },
    ...(isAuthenticated
      ? [
        { name: "Psychics", path: "/psychics-browse" },
        { name: "Chats", path: "/chats" },
        { name: "Life Path & Zodiac", path: "/oracle" },
        { name: "Articles", path: "/articles/" },
        { name: "Billing", path: "/billing" },
      ]
      : [
        { name: "Psychics", path: "/psychics-browse" },
        { name: "Life Path & Zodiac", path: "/oracle" },
        { name: "Articles", path: "/articles/" },
      ]),
  ];

  const logoPath = isClient ? HOME_PATH : isAuthenticated ? "/psychics-browse" : "/";

  const avatarInitial = (user?.username || "✦").charAt(0).toUpperCase();

  return (
    <>
      <header
        className={`gl-nav fixed inset-x-0 z-50 ${scrolled ? "gl-nav--scrolled" : ""}`}
        style={{ top: topOffset }}
      >
        <div className="gl-nav-inner">
          <div
            onClick={() => navigate(logoPath)}
            className="gl-logo"
            title="Ask Valentina — home"
          >
            <img src="/logo short normal.svg" alt="Ask Valentina home" className="gl-logo-img" />
            <span className="gl-wm hidden sm:inline">Ask Valentina</span>
          </div>

          <nav className="gl-links hidden lg:flex">
            {navItems.map((item) => {
              const isActive = item.primary || location.pathname === item.path;
              return (
                <button
                  key={item.name}
                  onClick={() => navigate(item.path)}
                  className={`gl-navlink ${isActive ? "on" : ""}`}
                >
                  {item.name}
                </button>
              );
            })}
          </nav>

          <div className="hidden lg:flex items-center gap-3.5 ml-auto">
            {/* Help — always reachable, opens the support email */}
            <a
              href={SUPPORT_MAILTO}
              title="Email our support team"
              className="gl-navlink"
            >
              Help
            </a>

            {isAuthenticated ? (
              <>
                <div
                  onClick={() => navigate("/profile")}
                  title="Your Constellation — your Stardust balance"
                  className="gl-stardust"
                >
                  ✦ <b>{balance !== null ? formatStardust(balance) : "…"}</b> Stardust
                </div>

                <button
                  type="button"
                  onClick={toggleTheme}
                  className="gl-theme-toggle"
                  title={themeToggleLabel}
                  aria-label={themeToggleLabel}
                >
                  {theme === "dark" ? "☀" : "☾"}
                </button>

                <button
                  onClick={() => navigate("/profile")}
                  className="gl-avatar"
                  title={`${user?.username || "Your"} Constellation`}
                >
                  {user?.profile_picture ? (
                    <img src={user.profile_picture} alt="Profile" />
                  ) : (
                    avatarInitial
                  )}
                </button>

                <NotificationBell variant="navbar" />
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="gl-theme-toggle"
                  title={themeToggleLabel}
                  aria-label={themeToggleLabel}
                >
                  {theme === "dark" ? "☀" : "☾"}
                </button>

                <button onClick={() => navigate("/login")} className="gl-btn-ghost">
                  Login
                </button>

                {hasWelcomeCredit(welcomeCreditGbp) && (
                  <button onClick={() => navigate("/register")} className="gl-btn-solid">
                    Get {formatGbp(welcomeCreditGbp)} Free
                  </button>
                )}
              </>
            )}
          </div>

          <div className="lg:hidden flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={toggleTheme}
              className="gl-theme-toggle"
              title={themeToggleLabel}
              aria-label={themeToggleLabel}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <button
              ref={menuButton}
              onClick={() => setMobileNavOpen(true)}
              className="gl-theme-toggle"
              title="Menu"
              aria-haspopup="dialog"
              aria-expanded={mobileNavOpen}
              aria-controls={MOBILE_MENU_ID}
            >
              <Icon icon="ph:list-bold" className="text-lg mx-auto" />
            </button>
          </div>
        </div>
      </header>

      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Mobile Drawer. Closed, it is only slid off screen, so inert keeps its
          items out of the Tab order and away from screen readers (ROUND35 A4).
          Open, it is a modal dialog named by the Menu button's word. */}
      <div
        id={MOBILE_MENU_ID}
        ref={drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!mobileNavOpen}
        className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] z-[70] transform transition-transform duration-300 lg:hidden ${
          mobileNavOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          background: "var(--gl-glass-2)",
          backdropFilter: "blur(26px) saturate(1.2)",
          WebkitBackdropFilter: "blur(26px) saturate(1.2)",
          borderLeft: "1px solid var(--gl-glass-edge)",
        }}
      >
        <div className="relative z-10 h-full flex flex-col">
          <div
            className="flex items-center justify-between p-4"
            style={{ borderBottom: "1px solid var(--gl-hair-soft)" }}
          >
            <div
              onClick={() => { navigate(logoPath); setMobileNavOpen(false); }}
              className="gl-logo"
            >
              <img src="/logo short normal.svg" alt="Ask Valentina home" className="gl-logo-img" />
              <span className="gl-wm">Ask Valentina</span>
            </div>
            {/* Focus goes back to the Menu button as the drawer closes (the dialog
                effect above): it turns inert, which would drop focus to the page. */}
            <button
              onClick={() => setMobileNavOpen(false)}
              className="gl-theme-toggle"
              title="Close menu"
            >
              <Icon icon="ph:x-bold" className="text-base mx-auto" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-1">
              {/* Flagship: the daily-habit Constellation is the FIRST item on mobile. */}
              {isAuthenticated && (
                <button
                  onClick={() => { navigate("/profile"); setMobileNavOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                  style={{
                    background: location.pathname === "/profile" ? "var(--gl-glass)" : "transparent",
                  }}
                >
                  <Icon
                    icon="ph:star-four-duotone"
                    className="text-xl"
                    style={{ color: "var(--gl-accent)" }}
                  />
                  <span
                    className="text-xs font-semibold uppercase tracking-[2px]"
                    style={{ color: location.pathname === "/profile" ? "var(--gl-accent)" : "var(--gl-text)", fontFamily: DRAWER_LABEL_FONT }}
                  >
                    Your Constellation
                  </span>
                </button>
              )}
              {navItems.map((item) => {
                const isActive = item.primary || location.pathname === item.path;
                return (
                  <button
                    key={item.name}
                    onClick={() => { navigate(item.path); setMobileNavOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                    style={{ background: isActive ? "var(--gl-glass)" : "transparent" }}
                  >
                    <Icon
                      icon={item.name === "Sanctuary" ? "ph:house-duotone" :
                            item.name === "Psychics" ? "ph:sparkle-duotone" :
                            item.name === "Chats" ? "ph:chat-circle-duotone" :
                            item.name === "Billing" ? "ph:credit-card-duotone" :
                            item.name === "Life Path & Zodiac" ? "ph:compass-duotone" :
                            "ph:stars-duotone"}
                      className="text-xl"
                      style={{ color: isActive ? "var(--gl-accent)" : "var(--gl-text-faint)" }}
                    />
                    <span
                      className="text-xs font-semibold uppercase tracking-[2px]"
                      style={{ color: isActive ? "var(--gl-accent)" : "var(--gl-text-dim)", fontFamily: DRAWER_LABEL_FONT }}
                    >
                      {item.name}
                    </span>
                  </button>
                );
              })}
              {/* Notifications was desktop-only (the bell) — reachable on mobile now. */}
              {isAuthenticated && (
                <button
                  onClick={() => { navigate("/notifications"); setMobileNavOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                  style={{
                    background: location.pathname === "/notifications" ? "var(--gl-glass)" : "transparent",
                  }}
                >
                  <Icon
                    icon="ph:bell-duotone"
                    className="text-xl"
                    style={{ color: location.pathname === "/notifications" ? "var(--gl-accent)" : "var(--gl-text-faint)" }}
                  />
                  <span
                    className="text-xs font-semibold uppercase tracking-[2px]"
                    style={{ color: location.pathname === "/notifications" ? "var(--gl-accent)" : "var(--gl-text-dim)", fontFamily: DRAWER_LABEL_FONT }}
                  >
                    Notifications
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="p-4" style={{ borderTop: "1px solid var(--gl-hair-soft)" }}>
            <div className="space-y-3">
              {isAuthenticated ? (
                <>
                  {/* Stardust pill taps through to its home — the Constellation balance. */}
                  <div
                    onClick={() => { navigate("/profile"); setMobileNavOpen(false); }}
                    className="gl-stardust justify-center"
                  >
                    ✦ <b>{balance !== null ? formatStardust(balance) : "…"}</b> Stardust
                  </div>

                  <a
                    href={SUPPORT_MAILTO}
                    onClick={() => setMobileNavOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                  >
                    <Icon icon="ph:lifebuoy-duotone" className="text-xl" style={{ color: "var(--gl-accent)" }} />
                    <span className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: "var(--gl-text-dim)", fontFamily: DRAWER_LABEL_FONT }}>
                      Help &amp; Support
                    </span>
                  </a>

                  <button
                    onClick={() => { logout(); setMobileNavOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                  >
                    <Icon icon="ph:sign-out-duotone" className="text-xl" style={{ color: "#c1443a" }} />
                    <span className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: "#c1443a", fontFamily: DRAWER_LABEL_FONT }}>
                      Sign Out
                    </span>
                  </button>
                </>
              ) : (
                <>
                  {/* Guests must be able to sign up / log in from the drawer, not see "Sign Out". */}
                  {hasWelcomeCredit(welcomeCreditGbp) && (
                    <button
                      onClick={() => { navigate("/register"); setMobileNavOpen(false); }}
                      className="gl-btn-solid w-full"
                    >
                      ✦ Get {formatGbp(welcomeCreditGbp)} Free
                    </button>
                  )}

                  <button
                    onClick={() => { navigate("/login"); setMobileNavOpen(false); }}
                    className="gl-btn-ghost w-full"
                  >
                    Login
                  </button>

                  <a
                    href={SUPPORT_MAILTO}
                    onClick={() => setMobileNavOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                  >
                    <Icon icon="ph:lifebuoy-duotone" className="text-xl" style={{ color: "var(--gl-accent)" }} />
                    <span className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: "var(--gl-text-dim)", fontFamily: DRAWER_LABEL_FONT }}>
                      Help &amp; Support
                    </span>
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

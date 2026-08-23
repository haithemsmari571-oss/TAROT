import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { useAuth } from "../features/auth/hooks";
import { paymentApi } from "../features/payment/api/paymentApi";
import { NotificationBell } from "../features/notifications/components/NotificationBell";
import { formatStardust } from "../lib/currency";
import { useGlassTheme } from "../lib/glassTheme";
import "../styles/glass.css";

export default function Navbar({ topOffset = 0 }: { topOffset?: number } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const { theme, toggleTheme } = useGlassTheme();

  const [balance, setBalance] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  const navItems = [
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

  const avatarInitial = (user?.username || "✦").charAt(0).toUpperCase();

  return (
    <>
      <header
        className={`gl-nav fixed inset-x-0 z-50 ${scrolled ? "gl-nav--scrolled" : ""}`}
        style={{ top: topOffset }}
      >
        <div className="gl-nav-inner">
          <div
            onClick={() => navigate("/psychics-browse")}
            className="gl-logo"
            title="Ask Valentina — home"
          >
            <img src="/logo short normal.svg" alt="Ask Valentina home" className="gl-logo-img" />
            <span className="gl-wm hidden sm:inline">Ask Valentina</span>
          </div>

          <nav className="gl-links hidden lg:flex">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
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
              href="mailto:support@askvalentina.co.uk"
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
                  title={theme === "dark" ? "Switch to daylight" : "Switch to candlelight"}
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
                  title={theme === "dark" ? "Switch to daylight" : "Switch to candlelight"}
                >
                  {theme === "dark" ? "☀" : "☾"}
                </button>

                <button onClick={() => navigate("/login")} className="gl-btn-ghost">
                  Login
                </button>

                <button onClick={() => navigate("/register")} className="gl-btn-solid">
                  Get £15 Free
                </button>
              </>
            )}
          </div>

          <div className="lg:hidden flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={toggleTheme}
              className="gl-theme-toggle"
              title={theme === "dark" ? "Switch to daylight" : "Switch to candlelight"}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <button
              onClick={() => setMobileNavOpen(true)}
              className="gl-theme-toggle"
              title="Menu"
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

      {/* Mobile Drawer */}
      <div
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
              onClick={() => { navigate("/psychics-browse"); setMobileNavOpen(false); }}
              className="gl-logo"
            >
              <img src="/logo short normal.svg" alt="Ask Valentina home" className="gl-logo-img" />
              <span className="gl-wm">Ask Valentina</span>
            </div>
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
                    style={{ color: location.pathname === "/profile" ? "var(--gl-accent)" : "var(--gl-text)" }}
                  >
                    Your Constellation
                  </span>
                </button>
              )}
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
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
                      style={{ color: isActive ? "var(--gl-accent)" : "var(--gl-text-dim)" }}
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
                    style={{ color: location.pathname === "/notifications" ? "var(--gl-accent)" : "var(--gl-text-dim)" }}
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
                    href="mailto:support@askvalentina.co.uk"
                    onClick={() => setMobileNavOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                  >
                    <Icon icon="ph:lifebuoy-duotone" className="text-xl" style={{ color: "var(--gl-accent)" }} />
                    <span className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: "var(--gl-text-dim)" }}>
                      Help &amp; Support
                    </span>
                  </a>

                  <button
                    onClick={() => { logout(); setMobileNavOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                  >
                    <Icon icon="ph:sign-out-duotone" className="text-xl" style={{ color: "#c1443a" }} />
                    <span className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: "#c1443a" }}>
                      Sign Out
                    </span>
                  </button>
                </>
              ) : (
                <>
                  {/* Guests must be able to sign up / log in from the drawer, not see "Sign Out". */}
                  <button
                    onClick={() => { navigate("/register"); setMobileNavOpen(false); }}
                    className="gl-btn-solid w-full"
                  >
                    ✦ Get £15 Free
                  </button>

                  <button
                    onClick={() => { navigate("/login"); setMobileNavOpen(false); }}
                    className="gl-btn-ghost w-full"
                  >
                    Login
                  </button>

                  <a
                    href="mailto:support@askvalentina.co.uk"
                    onClick={() => setMobileNavOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                  >
                    <Icon icon="ph:lifebuoy-duotone" className="text-xl" style={{ color: "var(--gl-accent)" }} />
                    <span className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: "var(--gl-text-dim)" }}>
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

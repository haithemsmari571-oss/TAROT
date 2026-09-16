import { useEffect } from "react";
import { NavLink, Outlet, useMatch } from "react-router-dom";
import { useInboxUnreadCount } from "./useInboxUnreadCount";
import "./client-app.css";

const tabs = [
  { path: "home", label: "Home" },
  { path: "readers", label: "Readers" },
  { path: "chats", label: "Chats" },
  { path: "you", label: "You" },
] as const;

function TabIcon({ tab }: { tab: (typeof tabs)[number]["path"] }) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tab === "home" && <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /></>}
      {tab === "readers" && <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6" /><path d="M17.5 14.9c2 .6 3.5 2.5 3.5 5.1" /></>}
      {tab === "chats" && <path d="M4 5.5h16v11H9l-5 4V5.5Z" />}
      {tab === "you" && <><circle cx="12" cy="8.5" r="3.6" /><path d="M4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" /></>}
    </svg>
  );
}

export default function ClientAppShell() {
  const { data: unreadCount = 0 } = useInboxUnreadCount();
  const isThread = useMatch("/app/chats/:chatId");
  const isInbox = useMatch("/app/chats");

  useEffect(() => {
    // Keep the app's font stylesheet out of the public/marketing layouts.
    const fonts = document.createElement("link");
    fonts.rel = "stylesheet";
    fonts.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700&family=Poppins:wght@400;500;600&display=swap";
    document.head.appendChild(fonts);
    return () => fonts.remove();
  }, []);

  return (
    <div className={`client-app-shell${isThread ? " client-app-shell-thread" : ""}${isInbox ? " client-app-shell-inbox" : ""}`}>
      <main className="client-app-content"><Outlet /></main>
      <nav className="client-app-nav" aria-label="App navigation">
        {tabs.map(({ path, label }) => (
          <NavLink key={path} to={`/app/${path}`} className={({ isActive }) => `client-app-tab${isActive ? " client-app-tab-active" : ""}`} aria-label={path === "chats" && unreadCount > 0 ? `Chats, ${unreadCount} unread conversations` : label}>
            <span className="client-app-icon">
              <TabIcon tab={path} />
              {path === "chats" && unreadCount > 0 && <span className="client-app-badge" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </span>
            <span className="client-app-label">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

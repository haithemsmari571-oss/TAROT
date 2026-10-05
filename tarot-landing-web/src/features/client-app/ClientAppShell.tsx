import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useMatch } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks";
import { useKeepPushInStep, useOpenFromNotification } from "@/features/push/webPush";
import HallStage from "../hall/HallStage";
import { InstallSheet } from "./AppSheets";
import ClientScreenBoundary from "./ClientScreenBoundary";
import { registerAppServiceWorker } from "./offline/appServiceWorker";
import { useInboxUnreadCount } from "./useInboxUnreadCount";
import { badgeText } from "./unreadBadge";
import "../../styles/glass.css";
import "./client-app.css";

const tabs = [
  { path: "home", label: "Home" },
  { path: "readers", label: "Readers" },
  { path: "shorts", label: "Shorts" },
  { path: "chats", label: "Chats" },
  { path: "you", label: "You" },
] as const;

function TabIcon({ tab }: { tab: (typeof tabs)[number]["path"] }) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tab === "home" && <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /></>}
      {tab === "readers" && <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6" /><path d="M17.5 14.9c2 .6 3.5 2.5 3.5 5.1" /></>}
      {tab === "shorts" && <><rect x="7" y="4" width="10" height="16" rx="2.5" /><path d="M10.5 9.5v5l4-2.5-4-2.5Z" /></>}
      {tab === "chats" && <path d="M4 5.5h16v11H9l-5 4V5.5Z" />}
      {tab === "you" && <><circle cx="12" cy="8.5" r="3.6" /><path d="M4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" /></>}
    </svg>
  );
}

export default function ClientAppShell() {
  const { data: unreadCount = 0 } = useInboxUnreadCount();
  const isThread = useMatch("/app/chats/:chatId");
  const isInbox = useMatch("/app/chats");
  const isReaders = useMatch("/app/readers/*");
  const isYou = useMatch("/app/you/*");
  const isHome = useMatch("/app/home/*");
  const isShorts = useMatch("/app/shorts");
  const { pathname } = useLocation();

  // The installed app's offline screen and kept build files (offline/sw.js).
  useEffect(() => registerAppServiceWorker(), []);
  // Phone notifications (ROUND57): this browser kept for whoever is signed in,
  // and a tapped notification opening its chat in this page.
  const { isAuthenticated } = useAuth();
  useKeepPushInStep("client", isAuthenticated);
  useOpenFromNotification();

  /* The hall's sky and runtime live only while the conversation screen is
     showing. Mounted behind every tab, HallStage's frame loop kept drawing the
     hidden sky at the panel's full rate (relay/PERF_RESULT.md, cause 1). The
     room reads the running hall from HallStage's context (HallRoom.tsx:168),
     so the stage wraps the content on /app/chats/:chatId alone; leaving the
     room unmounts it, which stops the loop and drops its canvases. The nav
     stays outside, so a tab press does not remount the control it sits on.
     A screen that cannot load or draw fails inside the content area, not the
     whole app (ClientScreenBoundary.tsx). */
  const content = <main className="client-app-content"><ClientScreenBoundary resetKey={pathname}><Outlet /></ClientScreenBoundary></main>;

  return (
    <div className={`client-app-shell${isThread ? " client-app-shell-thread" : ""}${isInbox ? " client-app-shell-inbox" : ""}${isReaders ? " client-app-shell-readers" : ""}${isYou ? " client-app-shell-you" : ""}${isHome ? " client-app-shell-home" : ""}${isShorts ? " client-app-shell-shorts" : ""}`}>
      {isThread ? <HallStage backdrop>{content}</HallStage> : content}
      <nav className="client-app-nav" aria-label="App navigation">
        {tabs.map(({ path, label }) => (
          <NavLink key={path} to={`/app/${path}`} className={({ isActive }) => `client-app-tab${isActive ? " client-app-tab-active" : ""}`} aria-label={path === "chats" && unreadCount > 0 ? `Chats, ${unreadCount} unread conversations` : label}>
            <span className="client-app-icon">
              <TabIcon tab={path} />
              {path === "chats" && unreadCount > 0 && <span className="client-app-badge" aria-hidden="true">{badgeText(unreadCount)}</span>}
            </span>
            <span className="client-app-label">{label}</span>
          </NavLink>
        ))}
      </nav>
      {/* Add to the home screen, suggested on arriving (ROUND57) */}
      <InstallSheet />
    </div>
  );
}

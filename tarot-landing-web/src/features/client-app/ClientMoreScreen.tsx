/* The You tab's More card and the screens it opens. Four of them host an
   existing page of the site (the Constellation, Notifications, Terms,
   Privacy) inside the app shell; the fifth, Help & contact, is the app's own
   (ClientHelpScreen.tsx). Each hosted page sits under the account screens'
   Back control (ClientAccountForm.tsx). What a page draws that the shell already has, its
   own page background and top pad, its Sign out and its balance card, is
   hidden by client-more.css through the wrapper's class; the page files are
   not edited. */
import type { ReactNode } from "react";
import { BackToYou } from "./ClientAccountForm";
import { YOU_CONSTELLATION_PATH, YOU_HELP_PATH, YOU_NOTIFICATIONS_PATH, YOU_PRIVACY_PATH, YOU_TERMS_PATH } from "./clientAppPaths";
import "./client-more.css";

/** The rows of the More card, in order, and each screen's name. */
export const MORE_LINKS = {
  constellation: { to: YOU_CONSTELLATION_PATH, label: "Your Constellation" },
  notifications: { to: YOU_NOTIFICATIONS_PATH, label: "Notifications" },
  terms: { to: YOU_TERMS_PATH, label: "Terms" },
  privacy: { to: YOU_PRIVACY_PATH, label: "Privacy" },
  /* the app's own screen, not a site page (ClientHelpScreen.tsx) */
  help: { to: YOU_HELP_PATH, label: "Help & contact" },
} as const;

/** Which page the wrapper holds; client-more.css keys its rules on it. */
export type MoreKind = "constellation" | "notifications" | "legal";

export function MoreScreen({ title, kind, children }: { title: string; kind: MoreKind; children: ReactNode }) {
  return (
    <section className="client-you client-you-screen" aria-label={title}>
      <BackToYou />
      <div className={`client-more-view client-more-${kind}`}>{children}</div>
    </section>
  );
}

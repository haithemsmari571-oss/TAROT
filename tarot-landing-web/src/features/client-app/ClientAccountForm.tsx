/* What the screens under You share: the column with the way back to
   /app/you at the top left and, for the account screens, the header under
   it; the line the You tab shows when a screen returns to it; and one
   reading of the backend's own words when it refuses. Each screen keeps its
   own form. The More card's screens (ClientMoreScreen.tsx) take the way
   back alone. */
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { COMPANY_IDENTITY, REGISTERED_OFFICE_LINE } from "@/lib/company";
import { REFUSAL_FALLBACK, serverRefusal } from "@/lib/serverRefusal";
import { YOU_PATH } from "./clientAppPaths";
import "./client-chats.css";
import "./client-readers.css";
import "./client-you.css";

/** Carried in history state back to /app/you, where the Account card shows it. */
export interface YouNotice { notice: string }

export const ACCOUNT_COPY = {
  eyebrow: "Your account",
  back: "Back to You",
  /** When there is no answer to quote: the request never reached the server. */
  failed: REFUSAL_FALLBACK,
} as const;

/* The backend's own words (lib/serverRefusal.ts): a wrong current password
   (services/auth.py:528), a taken name (services/users.py:393), a schema
   refusal's lines (schemas/user.py:43-67). */
export function refusalText(error: unknown): string {
  return serverRefusal(error) ?? ACCOUNT_COPY.failed;
}

/** The way back to /app/you: the reader profile's round control at the top
    left (client-readers.css, .client-reader-back). */
export function BackToYou() {
  const navigate = useNavigate();
  return (
    <div className="client-reader-profile-top">
      <button type="button" className="client-reader-back" aria-label={ACCOUNT_COPY.back} onClick={() => navigate(YOU_PATH)}>‹</button>
    </div>
  );
}

/** Who runs the site (lib/company.ts), in the You tab's fine print: at the
    foot of You and of Help & contact, as the site's footer shows it. */
export function CompanyLegal() {
  return <p className="legal" data-company-legal="">{COMPANY_IDENTITY}<br />{REGISTERED_OFFICE_LINE}</p>;
}

export function AccountFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="client-you client-you-screen" aria-label={title}>
      <BackToYou />
      <header className="client-chats-header">
        <p className="client-chats-eyebrow">{ACCOUNT_COPY.eyebrow}</p>
        <h1 className="client-chats-title">{title}</h1>
      </header>
      {children}
    </section>
  );
}

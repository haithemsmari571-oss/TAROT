/* What the screens under You share: the column with the way back to
   /app/you at the top left and, for the account screens, the header under
   it; the line the You tab shows when a screen returns to it; and one
   reading of the backend's own words when it refuses. Each screen keeps its
   own form. The More card's screens (ClientMoreScreen.tsx) take the way
   back alone. */
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
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
  failed: "Something went wrong. Please try again.",
} as const;

/* The backend's own words. A DomainError answers {message} (main.py:350-361,
   for a wrong current password, services/auth.py:528, and a taken name,
   services/users.py:393); an HTTPException answers {detail: string}; a schema
   refusal is a 422 whose detail is a list of {msg} lines, each behind
   Pydantic's "Value error, " framing (schemas/user.py:43-67). */
export function refusalText(error: unknown): string {
  if (isAxiosError(error) && error.response) {
    const data = error.response.data as { message?: unknown; detail?: unknown } | undefined;
    if (typeof data?.message === "string") return data.message;
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) {
      const lines = data.detail
        .map(item => (typeof (item as { msg?: unknown })?.msg === "string" ? (item as { msg: string }).msg.replace(/^Value error, /, "") : null))
        .filter((line): line is string => line !== null);
      if (lines.length > 0) return lines.join(" ");
    }
  }
  return ACCOUNT_COPY.failed;
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

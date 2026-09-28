/* The welcome-credit moment (ROUND38): once, on the first screen she lands on
   after she signs up, the celebration shows her free credit and its next step.
   Sign-up leaves the note here (useLogin.ts, afterSignUp) and the celebration
   host takes it on that screen (CelebrationProvider.tsx). It lives in this tab
   only and is taken once, so a reload never shows it again. */
const WELCOME_MOMENT_KEY = "av_welcome_moment";

export interface WelcomeMoment {
  /** the screen she lands on after sign-up, where the moment shows */
  at: string;
  /** where its button leads: her reader's thread, or the readers */
  to: string;
  /** her reader's price per message, for the credit's message count */
  price: number | null;
}

export function noteWelcomeMoment(moment: WelcomeMoment): void {
  try {
    sessionStorage.setItem(WELCOME_MOMENT_KEY, JSON.stringify(moment));
  } catch {
    /* no storage, no moment */
  }
}

/** The moment waiting for this screen, taken so it never shows twice. */
export function takeWelcomeMoment(pathname: string): WelcomeMoment | null {
  try {
    const stored = sessionStorage.getItem(WELCOME_MOMENT_KEY);
    if (!stored) return null;
    const moment = JSON.parse(stored) as WelcomeMoment;
    if (moment.at !== pathname) return null;
    sessionStorage.removeItem(WELCOME_MOMENT_KEY);
    return moment;
  } catch {
    return null;
  }
}

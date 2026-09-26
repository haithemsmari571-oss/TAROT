/* The count a badge shows, one source for the tab bar (ClientAppShell.tsx)
   and the You tab's rows (ClientYouScreen.tsx): three characters at most. */
export const BADGE_CAP = 99;
export const badgeText = (count: number) => (count > BADGE_CAP ? `${BADGE_CAP}+` : String(count));

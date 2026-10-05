/* The length on a Home card (ROUND53): whole minutes and seconds, "6 s" or
   "4 min 12 s", from the stored duration in seconds, which can carry
   decimals. The Sanctuary page keeps its own formatDuration (cover.tsx);
   this one is the Home card's, also used by the owner's preview of it. */
export function formatHomeDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const whole = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const remaining = whole % 60;
  if (minutes === 0) return `${remaining} s`;
  return remaining === 0 ? `${minutes} min` : `${minutes} min ${remaining} s`;
}

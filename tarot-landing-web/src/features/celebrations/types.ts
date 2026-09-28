export interface Celebration {
  id?: number; // server notification id (claim/gift); absent for local pull/streak
  // "welcome": her welcome credit, once after sign-up (welcomeMoment.ts)
  kind: "pull" | "streak" | "claim" | "gift" | "welcome";
  title: string;
  amount: number;
  message?: string; // personal note (admin gifts)
  to?: string; // where "Use your Stardust" leads; the readers when absent
}

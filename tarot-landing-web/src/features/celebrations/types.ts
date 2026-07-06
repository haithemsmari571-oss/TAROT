export interface Celebration {
  id?: number; // server notification id (claim/gift); absent for local pull/streak
  kind: "pull" | "streak" | "claim" | "gift";
  title: string;
  amount: number;
  message?: string; // personal note (admin gifts)
}

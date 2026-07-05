// Per-psychic Reader Activity (SUPERADMIN). Client spend only — psychics are
// salaried, there is no reader cut. Powers the superadmin workload monitor.

export type ActivityPeriod = "all" | "today" | "7d" | "30d" | "month";

export interface ReaderActivity {
  psychic_id: number;
  username: string;
  minutes_read: number;
  sessions: number;
  unique_clients: number;
  client_spend: number; // GBP
}

export interface ReaderActivityTotals {
  psychic_count: number;
  active_count: number;
  minutes_read: number;
  sessions: number;
  unique_clients: number;
  client_spend: number;
}

export interface ReaderActivityResponse {
  period: ActivityPeriod;
  psychics: ReaderActivity[];
  totals: ReaderActivityTotals;
}

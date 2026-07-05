import type { Transaction, TransactionStatus } from "../../ledger/types/transaction.types";

// Earnings filters
export interface EarningsFilters {
  status?: TransactionStatus;
  search?: string;
  page?: number;
  limit?: number;
  start_date?: string;
  end_date?: string;
}

// Paginated earnings response
export interface EarningsListResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// Client-spend / activity summary (GBP). Client spend only — psychics are
// salaried, so there is no "earnings" or reader cut anywhere here.
export interface EarningsSummary {
  totalClientSpend: number;
  pendingClientSpend: number;
  minutesRead: number;
  sessions: number;
  uniqueClients: number;
}

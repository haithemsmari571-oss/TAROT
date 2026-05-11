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

// Earnings summary
export interface EarningsSummary {
  totalEarnings: number;
  pendingEarnings: number;
  totalSessions: number;
  uniqueClients: number;
}

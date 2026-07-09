import { api } from "./client";

// Ledger history — same source the backend fee/billing work writes to
// (GET /api/transactions/me). Amounts are pounds to 2 dp.

export type TransactionType =
  | "CREDIT" // Stripe purchase / refund credit
  | "DEBIT" // session billing, message fees
  | "REFUND"
  | "REVERSAL"
  | "BONUS" // £15 welcome credit
  | "GIFT" // admin gift
  | "EARN" // earned Stardust (constellation pulls etc.)
  | "EXPIRE"; // earned Stardust that timed out

export interface Transaction {
  id: number;
  user_id: number;
  transaction_type: TransactionType;
  amount: number;
  balance_before: number;
  balance_after: number;
  status: string;
  description: string | null;
  related_chat_id: number | null;
  created_at: string;
}

export interface TransactionHistory {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export async function getMyTransactions(
  page = 1,
  limit = 50
): Promise<TransactionHistory> {
  const res = await api.get("/api/transactions/me", {
    params: { page, limit },
  });
  return res.data;
}

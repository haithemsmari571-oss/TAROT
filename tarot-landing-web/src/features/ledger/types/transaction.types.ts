// Transaction types matching backend API schemas

export enum TransactionType {
  CREDIT = "CREDIT",
  DEBIT = "DEBIT",
  REFUND = "REFUND",
  REVERSAL = "REVERSAL",
}

export enum TransactionStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  REVERSED = "REVERSED",
}

// Main transaction interface
export interface Transaction {
  id: number;
  user_id: number;
  transaction_type: TransactionType;
  amount: number;
  balance_before: number;
  balance_after: number;
  status: TransactionStatus;
  description: string;
  related_chat_id?: number;
  related_session_interval_id?: number;
  stripe_payment_intent_id?: string;
  idempotency_key?: string;
  transaction_metadata?: string;
  created_at: string;
  // Additional fields from join with User
  username?: string;
  user_email?: string;
}

// Paginated response
export interface TransactionListResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// Filter parameters for transaction list
export interface TransactionFilters {
  user_id?: number;
  transaction_type?: TransactionType;
  status?: TransactionStatus;
  start_date?: string;
  end_date?: string;
  min_amount?: number;
  max_amount?: number;
  search?: string; // For searching by description or user
  page?: number;
  limit?: number;
  sort_by?: "created_at" | "amount" | "user_id";
  sort_order?: "asc" | "desc";
}

// User balance info
export interface UserBalance {
  user_id: number;
  balance: number;
  username?: string;
  email?: string;
}

// Create transaction payload (admin)
export interface CreateTransactionPayload {
  user_id: number;
  transaction_type: TransactionType;
  amount: number;
  description: string;
  related_chat_id?: number;
  stripe_payment_intent_id?: string;
  transaction_metadata?: Record<string, unknown>;
}

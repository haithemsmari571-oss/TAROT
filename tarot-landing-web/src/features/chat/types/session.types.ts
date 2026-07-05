export type ChatStatus = 
  | 'REQUESTED' 
  | 'ACTIVE' 
  | 'PAUSED' 
  | 'ENDED' 
  | 'ARCHIVED' 
  | 'BLOCKED';

// Billing sub-state while a chat is live. Distinct from ChatStatus (the chat
// lifecycle). AWAITING_JOIN = psychic accepted but the client hasn't opened the
// conversation yet → the meter is FROZEN and nothing is billed. ACTIVE = the
// client has joined and the join-anchored meter is running.
export type SessionStatus = 'ACTIVE' | 'AWAITING_JOIN';

export interface ChatSessionData {
  chat_id: number;
  psychic_id?: number;
  chat_status: ChatStatus;
  session_started_at?: string;
  psychic_rate_per_second: number;
  client_balance: number;
  elapsed_seconds?: number;
  estimated_cost?: number;
  psychic_name?: string;
  // Backend billing status + free/paid split (from /chat/{id}/session-time).
  session_status?: SessionStatus;
  credit_balance?: number;
  paid_balance?: number;
}

// Periodic re-sync from getChatSessionTime — the join-anchored source of truth
// that corrects any local TICK drift and flips AWAITING_JOIN → ACTIVE on join.
export interface ChatSessionSyncData {
  elapsed_seconds: number;
  estimated_cost: number;
  price_per_second: number;
  client_balance: number;
  credit_balance?: number;
  paid_balance?: number;
  remaining_seconds?: number | null;
  session_status?: SessionStatus;
}

export interface ChatSessionState {
  // Core identifiers
  chatId: number | null;
  status: ChatStatus | null;
  psychicId: number | null;
  
  // Session timing
  sessionStartedAt: string | null;
  elapsedSeconds: number;
  
  // Billing
  psychicRatePerSecond: number;
  estimatedCost: number;
  clientBalance: number | null;
  // Free/paid split of the client's total spendable balance (orange = free
  // credit, purple = paid). Null until the first session-time sync.
  creditBalance: number | null;
  paidBalance: number | null;

  // Backend billing sub-state. While null we treat the session as not-yet-known
  // and do NOT tick. The local meter only runs when this is 'ACTIVE'.
  sessionStatus: SessionStatus | null;
  
  // Calculated values
  remainingBalance: number | null;
  remainingSeconds: number | null;
  
  // UI state
  isInputEnabled: boolean;
  showLowBalanceWarning: boolean;
  showCriticalWarning: boolean;
  showEndingWarning: boolean;
  showCriticalEndingWarning: boolean;
  isPaused: boolean;
  pauseReason: string | null;

  // Why the session ended (backend reason string, e.g. "user_initiated" vs
  // "insufficient_balance"). Single source of truth for the end-of-session
  // modal variant. Null while the session is still live.
  endReason: string | null;

  // Role context
  userRole: 'CLIENT' | 'PSYCHIC' | 'ADMIN';
}

export type ChatSessionAction =
  | { type: 'INITIALIZE'; payload: ChatSessionData }
  | { type: 'CHAT_ACCEPTED'; payload: ChatSessionData }
  | { type: 'TICK' }
  | { type: 'SYNC'; payload: ChatSessionSyncData }
  | { type: 'CHAT_PAUSED'; payload: { reason: string; elapsed_seconds: number; estimated_cost: number } }
  | { type: 'CHAT_RESUMED'; payload: { client_balance: number; elapsed_seconds?: number; remaining_seconds?: number | null; rate_per_second?: number } }
  | { type: 'CHAT_ENDED'; payload?: { elapsed_seconds?: number; estimated_cost?: number; reason?: string } }
  | { type: 'UPDATE_BALANCE'; payload: { balance: number } }
  | { type: 'SESSION_ENDED_NO_BALANCE' }
  | { type: 'RESET' };

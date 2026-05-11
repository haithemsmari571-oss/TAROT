export type ChatStatus = 
  | 'REQUESTED' 
  | 'ACTIVE' 
  | 'PAUSED' 
  | 'ENDED' 
  | 'ARCHIVED' 
  | 'BLOCKED';

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
  
  // Role context
  userRole: 'CLIENT' | 'PSYCHIC' | 'ADMIN';
}

export type ChatSessionAction =
  | { type: 'INITIALIZE'; payload: ChatSessionData }
  | { type: 'CHAT_ACCEPTED'; payload: ChatSessionData }
  | { type: 'TICK' }
  | { type: 'CHAT_PAUSED'; payload: { reason: string; elapsed_seconds: number; estimated_cost: number } }
  | { type: 'CHAT_RESUMED'; payload: { client_balance: number } }
  | { type: 'CHAT_ENDED'; payload?: { elapsed_seconds?: number; estimated_cost?: number; reason?: string } }
  | { type: 'UPDATE_BALANCE'; payload: { balance: number } }
  | { type: 'SESSION_ENDED_NO_BALANCE' }
  | { type: 'RESET' };

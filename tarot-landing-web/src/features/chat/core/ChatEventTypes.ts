/**
 * Frontend event types that mirror backend events
 * Ensures type-safety and consistency across client and psychic views
 */

export enum ChatEventType {
  // WebSocket Connection Events
  CONNECTED = 'ws:connected',
  DISCONNECTED = 'ws:disconnected',
  RECONNECTING = 'ws:reconnecting',
  ERROR = 'ws:error',
  
  // Message Events
  MESSAGE_RECEIVED = 'message:received',
  MESSAGE_SENT = 'message:sent',
  MESSAGE_ERROR = 'message:error',
  
  // Session Events  
  SESSION_STARTED = 'session:started',
  SESSION_INFO = 'session:info',
  SESSION_TIMER_TICK = 'session:timer_tick',
  SESSION_ENDING_SOON = 'session:ending_soon',
  SESSION_ENDED = 'session:ended',
  SESSION_PAUSED = 'session:paused',
  SESSION_RESUMED = 'session:resumed',
  
  // Balance Events (Client-specific)
  BALANCE_WARNING = 'balance:warning',
  BALANCE_CRITICAL = 'balance:critical',
  BALANCE_INSUFFICIENT = 'balance:insufficient',
  BALANCE_UPDATED = 'balance:updated',
  
  // UI Events
  CHAT_SELECTED = 'ui:chat_selected',
  CHAT_CLOSED = 'ui:chat_closed',
  TYPING_START = 'typing:start',
  TYPING_STOP = 'typing:stop',
}

/**
 * Message interface
 */
export interface ChatMessage {
  id?: number;
  type?: string;
  content: string;
  user_id?: number;
  sender_id?: number | null;
  timestamp?: string;
  created_at?: string;
  chat_id?: number;
  is_system?: boolean;
}

/**
 * Type-safe event payloads
 */
export type ChatEventPayload = {
  [ChatEventType.CONNECTED]: undefined;
  [ChatEventType.DISCONNECTED]: undefined;
  [ChatEventType.RECONNECTING]: undefined;
  [ChatEventType.ERROR]: { error: string | Error };
  
  [ChatEventType.MESSAGE_RECEIVED]: { message: ChatMessage };
  [ChatEventType.MESSAGE_SENT]: { content: string };
  [ChatEventType.MESSAGE_ERROR]: { error: string };
  
  [ChatEventType.SESSION_STARTED]: { 
    chatId: number;
    psychicRate?: number;
    clientBalance?: number;
    startedAt?: string;
  };
  [ChatEventType.SESSION_INFO]: { 
    chat_id: number;
    elapsed_seconds: number;
    estimated_cost: number;
    remaining_seconds: number;
    client_balance: number;
    chat_status: string;
    session_status: string;
    started_at: string;
    rate_per_second: number;
  };
  [ChatEventType.SESSION_TIMER_TICK]: {
    elapsedSeconds: number;
    estimatedCost: number;
    effectiveBalance: number;
    remainingSeconds: number;
  };
  [ChatEventType.SESSION_ENDING_SOON]: { remainingSeconds: number };
  [ChatEventType.SESSION_ENDED]: { reason?: string };
  [ChatEventType.SESSION_PAUSED]: { reason: string; elapsed_seconds?: number };
  [ChatEventType.SESSION_RESUMED]: { 
    elapsed_seconds?: number; 
    remaining_seconds?: number; 
    client_balance?: number;
    rate_per_second?: number;
  };
  
  [ChatEventType.BALANCE_WARNING]: { 
    remainingSeconds: number;
    remainingPoints?: number;
  };
  [ChatEventType.BALANCE_CRITICAL]: { remainingSeconds: number };
  [ChatEventType.BALANCE_INSUFFICIENT]: undefined;
  [ChatEventType.BALANCE_UPDATED]: { 
    newBalance: number;
    amountDeducted?: number;
  };
  
  [ChatEventType.CHAT_SELECTED]: { chatId: number };
  [ChatEventType.CHAT_CLOSED]: { chatId: number };
  [ChatEventType.TYPING_START]: { userId: number };
  [ChatEventType.TYPING_STOP]: { userId: number };
};

/**
 * Event callback type helper
 */
export type EventCallback<T extends ChatEventType> = (
  payload: ChatEventPayload[T]
) => void;

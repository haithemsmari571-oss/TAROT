import { api } from "./client";

export interface MyChat {
  id: number;
  user_id: number;
  psychic_id: number;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  client_id: number | null;
  client_username: string | null;
  client_email: string | null;
  psychic_username: string | null;
  psychic_email: string | null;
}

export interface ChatMessage {
  id?: number;
  type?: string; // "system" for server/system messages
  content: string;
  sender_id?: number;
  user_id?: number;
  chat_id?: number;
  created_at?: string;
  timestamp?: string;
  is_system?: boolean; // true for system/event messages (accepted, paused, …)
}

interface ChatMessagesResponse {
  messages: ChatMessage[];
  total: number;
  offset: number;
  limit: number;
}

/** All chats for the current user (client sees their chats, psychic sees theirs). */
export async function getMyChats(): Promise<MyChat[]> {
  const res = await api.get("/api/chat/my-chats");
  return res.data ?? [];
}

/**
 * Request a chat with a psychic. Creates (or re-opens) a chat in REQUESTED
 * status with an initial message. Reuses the existing backend endpoint the
 * website uses; the psychic/admin accepts it elsewhere to make it ACTIVE.
 */
export async function requestChat(
  psychicId: number,
  message: string
): Promise<void> {
  await api.post("/api/chat/request", { psychic_id: psychicId, message });
}

export interface SessionTime {
  elapsed_seconds: number;
  estimated_cost: number; // pounds
  price_per_second: number; // pounds per second
  client_balance: number; // pounds (credit + paid + earned, live from DB)
  credit_balance?: number; // pounds — free welcome/gift credit portion
  paid_balance?: number; // pounds — purchased portion
  remaining_seconds: number;
  /**
   * AWAITING_JOIN before the client joins; ACTIVE while billing; GRACE during
   * the out-of-balance top-up hold (meter stopped, short countdown to auto-end).
   */
  session_status?: string;
  /** Seconds left before a GRACE session auto-ends (only while GRACE). */
  grace_seconds_left?: number;
  /** True while a top-up checkout for this session is in flight. */
  is_topping_up?: boolean;
}

/** Current session duration, cost, rate and client balance for an active chat. */
export async function getSessionTime(chatId: number): Promise<SessionTime> {
  const res = await api.get(`/api/chat/${chatId}/session-time`);
  return res.data;
}

/** End the chat session (client-initiated). Same endpoint the website uses. */
export async function endChat(chatId: number): Promise<void> {
  await api.post(`/api/chat/${chatId}/status`, { status: "ENDED" });
}

export interface JoinChatResult {
  chat_id?: number;
  session_status?: string; // ACTIVE, or GRACE when minute 1 wasn't affordable
  client_balance?: number;
  remaining_seconds?: number;
}

/**
 * Join an accepted chat. Anchors the session timer to this moment on the
 * backend (the timer does not run between accept and join) and charges the
 * first minute upfront. Idempotent — but ONLY ever call it from an explicit
 * user action (the JOIN button): joining is the moment billing starts.
 */
export async function joinChat(chatId: number): Promise<JoinChatResult> {
  const res = await api.post(`/api/chat/${chatId}/join`);
  return res.data ?? {};
}

/**
 * Fetch messages for a chat. A negative offset returns the last abs(offset)
 * messages (newest window), oldest-first — matches how the web loads history.
 */
export async function getChatMessages(
  chatId: number,
  limit = 30,
  offset = -30
): Promise<ChatMessage[]> {
  const res = await api.get<ChatMessagesResponse>(
    `/api/chat/${chatId}/messages`,
    { params: { limit, offset } }
  );
  return res.data?.messages ?? [];
}

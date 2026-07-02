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
  type?: string;
  content: string;
  sender_id?: number;
  user_id?: number;
  chat_id?: number;
  created_at?: string;
  timestamp?: string;
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

import axiosClient from "@/lib/axiosClient";

/* The owner's messaging routes (ROUND52), called with the owner's token. Every
   route is superadmin-only on the server and answers {"detail": "<CODE>"} when
   it refuses (routers/owner_messaging.py). Times are ISO 8601 UTC; a mode is
   "automatic" or "hybrid". */

export type ConversationMode = "automatic" | "hybrid";

export interface InboxItem {
  chat_id: number;
  client_id: number;
  client_name: string;
  reader_id: number;
  reader_name: string;
  reader_picture_url: string | null;
  mode: ConversationMode;
  last_message_text: string | null;
  last_sender: "client" | "reader" | null;
  last_activity_at: string;
  waiting: boolean;
  has_suggestion: boolean;
  oldest_unanswered_at: string | null;
  refund_at: string | null;
}

export interface InboxPage {
  items: InboxItem[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface Suggestion {
  id: number;
  /* The reply's bubbles, separated by a blank line. */
  text: string;
  through_message_id: number;
  created_at: string;
}

export interface ThreadMessage {
  id: number;
  side: "client" | "reader" | "system";
  text: string;
  created_at: string;
  status: "sent" | "delivered" | "seen" | null;
}

export interface Thread {
  chat_id: number;
  mode: ConversationMode;
  client_id: number;
  client_name: string;
  reader_id: number;
  reader_name: string;
  reader_picture_url: string | null;
  waiting: boolean;
  unanswered_message_ids: number[];
  oldest_unanswered_at: string | null;
  refund_at: string | null;
  suggestion: Suggestion | null;
  suggestion_generating: boolean;
  /* Oldest first. */
  messages: ThreadMessage[];
  has_more: boolean;
}

export interface ReplySent {
  chat_id: number;
  message_id: number;
  suggestion_id: number | null;
  closed_as_answered: number[];
}

/* The page sizes the screens ask for. */
export const INBOX_PAGE_SIZE = 20;
export const THREAD_PAGE_SIZE = 50;
/* The largest page the inbox route serves, for counting what needs him. */
export const INBOX_MAX_PAGE_SIZE = 100;

const INBOX_PATH = "/admin/inbox";
const chatPath = (chatId: number) => `/admin/chats/${chatId}`;

export async function getInbox(offset: number, limit: number = INBOX_PAGE_SIZE): Promise<InboxPage> {
  const { data } = await axiosClient.get<InboxPage>(INBOX_PATH, { params: { offset, limit } });
  return data;
}

/* The newest messages, or those before beforeId. Reading marks nothing read. */
export async function getThread(chatId: number, beforeId?: number): Promise<Thread> {
  const { data } = await axiosClient.get<Thread>(`${chatPath(chatId)}/thread`, {
    params: { limit: THREAD_PAGE_SIZE, ...(beforeId ? { before_id: beforeId } : {}) },
  });
  return data;
}

export async function setMode(chatId: number, mode: ConversationMode): Promise<ConversationMode> {
  const { data } = await axiosClient.put<{ mode: ConversationMode }>(`${chatPath(chatId)}/mode`, { mode });
  return data.mode;
}

/* The suggestion as edited, or his own words: sent to her as the reader. */
export async function sendReply(chatId: number, content: string): Promise<ReplySent> {
  const { data } = await axiosClient.post<ReplySent>(`${chatPath(chatId)}/suggestion/send`, { content });
  return data;
}

export async function discardSuggestion(chatId: number): Promise<void> {
  await axiosClient.post(`${chatPath(chatId)}/suggestion/discard`);
}

/* 202: a new suggestion is being written; the thread shows it when stored. */
export async function requestSuggestion(chatId: number): Promise<void> {
  await axiosClient.post(`${chatPath(chatId)}/suggestion/regenerate`);
}

export async function setTyping(chatId: number, typing: boolean): Promise<void> {
  await axiosClient.put(`${chatPath(chatId)}/typing`, { typing });
}

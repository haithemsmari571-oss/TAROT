/* The reader a guest chose before she had an account (ROUND38). START READING
   on a reader's page sends her to sign-up with ?reader=<id>; sign-up and
   sign-in pass it to each other and, once she is signed in, open her thread
   with that reader, so she lands in it instead of the app's Home. The address
   carries the choice, so it is used once and gone: the thread's own address
   has no ?reader. */
import type { AxiosRequestConfig } from "axios";
import axiosClient from "@/lib/axiosClient";
import { CHATS_PATH, READERS_PATH } from "./clientAppPaths";

export const READER_PARAM = "reader";

/** The chosen reader's id from an address's query, or null. */
export function readerIdFrom(params: URLSearchParams): number | null {
  const id = Number(params.get(READER_PARAM));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** A page's address with the chosen reader, when there is one. */
export function withReader(path: string, readerId: number | null): string {
  return readerId == null ? path : `${path}?${READER_PARAM}=${readerId}`;
}

export const threadPath = (chatId: number) => `${CHATS_PATH}/${chatId}`;
export const readerProfilePath = (readerId: number) => `${READERS_PATH}/${readerId}`;

/** POST /chat/conversation: the fields the app reads from its answer. */
export interface ConversationOpened {
  chat_id: number;
  created: boolean;
  price_per_message: number | null;
}

/** Opens her conversation with a reader, or finds the one she has. The
    reader's opener is in it and nothing is charged. */
export async function openConversation(psychicId: number, config?: AxiosRequestConfig): Promise<ConversationOpened> {
  return (await axiosClient.post<ConversationOpened>("/chat/conversation", { psychic_id: psychicId }, config)).data;
}

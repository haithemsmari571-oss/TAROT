import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";
import {
  getInbox,
  getThread,
  INBOX_MAX_PAGE_SIZE,
  INBOX_PAGE_SIZE,
  setTyping,
  type ConversationMode,
  type InboxItem,
  type Thread,
  type ThreadMessage,
} from "./ownerMessagesApi";

/* Messages (ROUND53): the inbox, one conversation, and the badge on the
   owner's home, on ROUND52's routes. Every list refreshes on its own while the
   page is visible (TanStack pauses an interval while the tab is hidden). */

export const INBOX_REFRESH_MS = 15_000;
export const THREAD_REFRESH_MS = 5_000;
/* While a suggestion is being written the thread is read faster, and for at
   most a minute. */
export const WRITING_REFRESH_MS = 2_000;
export const WRITING_PATIENCE_MS = 60_000;
/* His typing dots stop this long after his last key. */
export const TYPING_IDLE_MS = 4_000;

/* The two modes as the owner reads them: the chip, the switch. */
export const MODE_LABEL: Record<ConversationMode, string> = {
  hybrid: "Hybrid",
  automatic: "Automatic",
};

export const OWNER_INBOX_QUERY_KEY = ["owner-inbox"] as const;
export const OWNER_ATTENTION_QUERY_KEY = ["owner-inbox-attention"] as const;
export const ownerThreadQueryKey = (chatId: number) => ["owner-thread", chatId] as const;

/* A conversation that needs him: a suggestion ready, or her waiting for a
   reply. The inbox lists these first (ROUND52 order), so they can be counted
   from the top. */
export const needsHim = (item: InboxItem) => item.has_suggestion || item.waiting;

export function useOwnerInbox() {
  return useInfiniteQuery({
    queryKey: OWNER_INBOX_QUERY_KEY,
    queryFn: ({ pageParam }) => getInbox(pageParam, INBOX_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.has_more ? last.offset + last.items.length : undefined),
    refetchInterval: INBOX_REFRESH_MS,
  });
}

/* The rows of every loaded page, once each: a refresh can move a conversation
   from one page to the next. */
export function inboxRows(pages: { items: InboxItem[] }[] | undefined): InboxItem[] {
  const seen = new Set<number>();
  const rows: InboxItem[] = [];
  pages?.forEach((page) => page.items.forEach((item) => {
    if (seen.has(item.chat_id)) return;
    seen.add(item.chat_id);
    rows.push(item);
  }));
  return rows;
}

/* The home tile's gold count: conversations with a suggestion ready or her
   waiting, read from the top of the inbox until the first that needs nothing. */
export function useAttentionCount() {
  return useQuery({
    queryKey: OWNER_ATTENTION_QUERY_KEY,
    queryFn: async () => {
      let count = 0;
      for (let offset = 0; ; offset += INBOX_MAX_PAGE_SIZE) {
        const page = await getInbox(offset, INBOX_MAX_PAGE_SIZE);
        const needing = page.items.filter(needsHim).length;
        count += needing;
        if (needing < page.items.length || !page.has_more) return count;
      }
    },
    refetchInterval: INBOX_REFRESH_MS,
  });
}

/* One conversation as the screen holds it: the newest page as the server last
   gave it, with every message read so far (older pages, and newer ones that
   have since left the newest page) kept by id, oldest first. */
export interface ThreadView extends Thread {
  olderToLoad: boolean;
}

const byTime = (a: ThreadMessage, b: ThreadMessage) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id;

export function mergeMessages(kept: ThreadMessage[], incoming: ThreadMessage[]): ThreadMessage[] {
  const rows = new Map(kept.map((message) => [message.id, message]));
  incoming.forEach((message) => rows.set(message.id, message));
  return [...rows.values()].sort(byTime);
}

export function useOwnerThread(
  chatId: number,
  queryClient: QueryClient,
  refetchInterval: (view: ThreadView | undefined) => number,
) {
  return useQuery({
    queryKey: ownerThreadQueryKey(chatId),
    queryFn: async (): Promise<ThreadView> => {
      const page = await getThread(chatId);
      const kept = queryClient.getQueryData<ThreadView>(ownerThreadQueryKey(chatId));
      return {
        ...page,
        messages: mergeMessages(kept?.messages ?? [], page.messages),
        olderToLoad: kept ? kept.olderToLoad : page.has_more,
      };
    },
    enabled: Number.isInteger(chatId) && chatId > 0,
    refetchInterval: (query) => refetchInterval(query.state.data),
  });
}

/* His typing dots in her room: typing true once when he starts, false four
   seconds after his last key, when he sends, or when he leaves the screen. */
export function useTypingSignal(chatId: number) {
  const on = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (!on.current) return;
    on.current = false;
    void setTyping(chatId, false).catch(() => undefined);
  }, [chatId]);
  const typed = useCallback(() => {
    if (!on.current) {
      on.current = true;
      void setTyping(chatId, true).catch(() => undefined);
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(stop, TYPING_IDLE_MS);
  }, [chatId, stop]);
  useEffect(() => stop, [stop]);
  return { typed, stop };
}

/* The refusal code a route answered with ({"detail": "<CODE>"}), if any. */
export function refusalOf(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
  return typeof detail === "string" ? detail : null;
}
export const CHAT_IS_AUTOMATIC = "CHAT_IS_AUTOMATIC";
export const NOTHING_TO_ANSWER = "NOTHING_TO_ANSWER";

/* A clock that moves on its own, for "5 min" and "refund in 5 h". */
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

/* ── Times, on the phone's own clock ── */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
// en-GB shortens September to "Sept"; plain English gives three letters.
const dayMonth = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });
const shortDay = (date: Date) => {
  const part = Object.fromEntries(dayMonth.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${part.day} ${part.month}`;
};
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const dayAfter = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
const dayBefore = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);

/* An inbox row's time: "now", "5 min", "3 h", "2 d", then "18 Sep". */
export function sinceLabel(iso: string, now: number): string {
  const elapsed = now - Date.parse(iso);
  if (elapsed < MINUTE) return "now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} d`;
  return shortDay(new Date(iso));
}

/* "refund in 5 h", "refund in 40 min", or "refund due" once it is past. */
export function refundInLabel(iso: string, now: number): string {
  const left = Date.parse(iso) - now;
  if (left <= 0) return "refund due";
  if (left < HOUR) return `refund in ${Math.max(1, Math.ceil(left / MINUTE))} min`;
  return `refund in ${Math.round(left / HOUR)} h`;
}

/* "14:20 today", "14:20 tomorrow", else "14:20 on 7 Oct". */
export function refundClockLabel(iso: string, now: number): string {
  const when = new Date(iso);
  const today = new Date(now);
  const time = clock.format(when);
  if (sameDay(when, today)) return `${time} today`;
  if (sameDay(when, dayAfter(today))) return `${time} tomorrow`;
  return `${time} on ${shortDay(when)}`;
}

/* A message's time: "14:20" today, "Yesterday 14:20", else "3 Oct 14:20". */
export function messageTimeLabel(iso: string, now: number): string {
  const when = new Date(iso);
  const today = new Date(now);
  const time = clock.format(when);
  if (sameDay(when, today)) return time;
  if (sameDay(when, dayBefore(today))) return `Yesterday ${time}`;
  return `${shortDay(when)} ${time}`;
}

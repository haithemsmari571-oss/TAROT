import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks";
import { ChatWebSocket } from "@/features/chat/api/chatApi";
import axiosClient from "@/lib/axiosClient";

export type Receipt = "sent" | "delivered" | "seen";
export interface ThreadMessage {
  id: number;
  sender_id: number | null;
  content: string;
  created_at: string;
  status: string;
  is_system?: boolean;
}
interface MessagePage { messages: ThreadMessage[]; total: number }
interface FrameData {
  message_id?: number;
  reason?: string;
  message?: string;
  balance?: number;
  client_balance?: number;
  price_per_message?: number;
}
interface Frame extends FrameData {
  type?: string;
  event?: string;
  data?: FrameData;
  id?: number;
  sender_id?: number;
  reader_id?: number;
  content?: string;
  created_at?: string;
  status?: string;
  is_system?: boolean;
}

export function receiptOf(status: string): Receipt {
  return status === "READ" ? "seen" : status === "DELIVERED" ? "delivered" : "sent";
}
const rank = (status: string) => ({ sent: 0, delivered: 1, seen: 2 })[receiptOf(status)];
const latestStatus = (a: string, b: string) => rank(a) >= rank(b) ? a : b;
export const messageDate = (value: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);

// History can arrive after a socket receipt. Never let that older snapshot undo it.
function mergeMessages(current: ThreadMessage[], incoming: ThreadMessage[], receipts: Map<number, string>) {
  const rows = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) {
    const previous = rows.get(message.id);
    rows.set(message.id, {
      ...message,
      status: latestStatus(latestStatus(message.status, previous?.status ?? "SENT"), receipts.get(message.id) ?? "SENT"),
    });
  }
  return [...rows.values()].sort((a, b) => messageDate(a.created_at).getTime() - messageDate(b.created_at).getTime() || a.id - b.id);
}

export function useThreadConnection(chatId: number, initialBalance: number, initialPrice: number | null) {
  const { user, token } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<ThreadMessage | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState(initialBalance);
  const [price, setPrice] = useState(initialPrice);
  const socket = useRef<ChatWebSocket | null>(null);
  const pendingRef = useRef<ThreadMessage | null>(null);
  const receipts = useRef(new Map<number, string>());

  useEffect(() => {
    if (!token || !userId) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelay = 1000;
    const controller = new AbortController();
    let opening: Promise<void> | null = null;
    let openAgain = false;
    const invalidateBadge = () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["client-app-inbox-unread", userId] }),
      queryClient.invalidateQueries({ queryKey: ["client-inbox", userId] }),
    ]);
    const markOpen = () => {
      if (disposed || document.visibilityState !== "visible") return;
      if (opening) { openAgain = true; return; }
      opening = axiosClient.post(`/chat/${chatId}/open`, undefined, { signal: controller.signal })
        .then(() => { if (!disposed) void invalidateBadge(); })
        .catch(() => { if (!disposed) setError("Could not update read status. Reopen this chat to try again."); })
        .finally(() => { opening = null; if (openAgain) { openAgain = false; markOpen(); } });
    };
    const loadLatest = async () => {
      try {
        const { data } = await axiosClient.get<MessagePage>(`/chat/${chatId}/messages`, {
          params: { limit: 50, offset: -50 }, signal: controller.signal,
        });
        if (disposed) return;
        setMessages(current => mergeMessages(current, data.messages, receipts.current));
        setTotal(data.total);
      } catch {
        if (!disposed) setError("Could not load the thread. Reopen this chat to try again.");
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    const restorePending = () => {
      const content = pendingRef.current?.content;
      if (content) setDraft(current => current || content);
      pendingRef.current = null;
      setPending(null);
    };
    const advanceReceipt = (id: number, status: string) => {
      receipts.current.set(id, latestStatus(status, receipts.current.get(id) ?? "SENT"));
      setMessages(current => current.map(message => message.id === id ? { ...message, status: latestStatus(message.status, status) } : message));
    };
    const connect = () => {
      if (disposed) return;
      const ws = new ChatWebSocket(chatId, token);
      socket.current = ws;
      ws.onConnect(() => {
        if (disposed) return;
        reconnectDelay = 1000;
        setConnected(true);
        void loadLatest();
        markOpen();
      });
      ws.onMessage((frame: Frame) => {
        if (disposed) return;
        const event = frame.event ?? frame.type;
        const data = frame.data ?? frame;
        if (event === "message" && frame.id && frame.content !== undefined && frame.created_at) {
          const message: ThreadMessage = { id: frame.id, content: frame.content, sender_id: frame.sender_id ?? null, created_at: frame.created_at, status: frame.status ?? "SENT", is_system: frame.is_system };
          setMessages(current => mergeMessages(current, [message], receipts.current));
          if (message.sender_id === userId && message.content === pendingRef.current?.content) {
            pendingRef.current = null;
            setPending(null);
          } else if (message.sender_id !== userId) {
            setThinking(false);
            markOpen();
            void invalidateBadge();
          }
        } else if ((event === "message_delivered" || event === "message_seen") && data.message_id) {
          advanceReceipt(data.message_id, event === "message_seen" ? "READ" : "DELIVERED");
          if (event === "message_seen") setThinking(true);
        } else if (event === "messages_read" && frame.reader_id !== userId) {
          setMessages(current => current.map(message => message.sender_id === userId ? { ...message, status: "READ" } : message));
        } else if ((event === "typing_start" || event === "typing_stop") && frame.sender_id !== userId) {
          setThinking(event === "typing_start");
        } else if (event === "message_rejected") {
          restorePending();
          setRejection(data.reason ?? "Message could not be sent.");
          if (data.balance !== undefined) setBalance(data.balance);
        } else if (event === "message_fee_charged") {
          if (data.client_balance !== undefined) setBalance(data.client_balance);
          void queryClient.invalidateQueries({ queryKey: ["currentUser"] });
        } else if (event === "balance_updated" || event === "session_info") {
          if (data.balance !== undefined) setBalance(data.balance);
          else if (data.client_balance !== undefined) setBalance(data.client_balance);
        }
        if (data.price_per_message !== undefined) setPrice(data.price_per_message);
      });
      ws.onError(() => { if (!disposed) setError("The connection was interrupted. Check the thread before sending again."); });
      ws.onDisconnect(() => {
        if (disposed) return;
        setConnected(false);
        setThinking(false);
        restorePending();
        // Never resend a paid message automatically; reload history on reconnect.
        retry = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 15_000);
      });
      ws.connect();
    };
    markOpen();
    connect();
    document.addEventListener("visibilitychange", markOpen);
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", markOpen);
      socket.current?.disconnect();
      socket.current = null;
    };
  }, [chatId, token, userId, queryClient]);

  const send = useCallback(() => {
    const content = draft.trim();
    if (!connected || !socket.current?.isConnected() || pendingRef.current || !content) return;
    const message: ThreadMessage = { id: -1, sender_id: user!.id, content, created_at: new Date().toISOString(), status: "SENT" };
    pendingRef.current = message;
    setPending(message);
    setDraft("");
    setRejection(null);
    setError(null);
    socket.current.sendMessage(content);
  }, [connected, draft, user]);

  const loadOlder = async () => {
    if (!messages.length) return;
    const { data } = await axiosClient.get<MessagePage>(`/chat/${chatId}/messages`, { params: { limit: 50, before_id: messages[0].id } });
    setMessages(current => mergeMessages(current, data.messages, receipts.current));
    setTotal(data.total);
  };
  return { messages, loading, connected, thinking, draft, setDraft, pending, rejection, error, balance, price, send, loadOlder, hasOlder: messages.length < total };
}

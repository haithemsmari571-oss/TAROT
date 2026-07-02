import { useCallback, useEffect, useRef, useState } from "react";
import { getChatMessages, type ChatMessage } from "../api/chat";
import { ChatSocket } from "../api/chatSocket";
import { getValidAccessToken } from "../lib/refresh";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

interface UseChatWebSocket {
  messages: ChatMessage[];
  sendMessage: (content: string) => void;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  loadingHistory: boolean;
  error: string | null;
  sessionPaused: boolean; // true after a session_paused event, until resumed
}

function normalize(m: ChatMessage): ChatMessage {
  return {
    ...m,
    sender_id: m.sender_id ?? m.user_id,
    user_id: m.user_id ?? m.sender_id,
    created_at: m.created_at ?? m.timestamp,
    timestamp: m.timestamp ?? m.created_at,
  };
}

/** Manages history load + live WebSocket for a single chat. */
export function useChatWebSocket(chatId: number | null): UseChatWebSocket {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionPaused, setSessionPaused] = useState(false);
  const socketRef = useRef<ChatSocket | null>(null);

  useEffect(() => {
    if (!chatId) {
      setConnectionStatus("disconnected");
      setMessages([]);
      setSessionPaused(false);
      return;
    }

    setSessionPaused(false);

    let cancelled = false;

    (async () => {
      const token = await getValidAccessToken();
      if (!token) {
        setError("You need to sign in to open this chat.");
        setConnectionStatus("error");
        return;
      }

      // Load recent history first (non-fatal if it fails).
      setLoadingHistory(true);
      try {
        const history = await getChatMessages(chatId);
        if (!cancelled) setMessages(history.map(normalize));
      } catch {
        // ignore — the socket can still connect
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }

      if (cancelled) return;

      setConnectionStatus("connecting");
      const socket = new ChatSocket(chatId, token);
      socketRef.current = socket;

      socket.onConnect(() => {
        setIsConnected(true);
        setConnectionStatus("connected");
        setError(null);
      });

      socket.onMessage((message) => {
        const nm = normalize(message);
        setMessages((prev) => {
          if (nm.id != null && prev.some((m) => m.id === nm.id)) {
            return prev;
          }
          return [...prev, nm];
        });
      });

      socket.onError((err) => {
        setError(err.message || err.error || "Connection error");
        setConnectionStatus("error");
        setIsConnected(false);
      });

      socket.onDisconnect(() => {
        setIsConnected(false);
        setConnectionStatus((s) => (s === "error" ? s : "disconnected"));
      });

      socket.onSessionPaused(() => setSessionPaused(true));
      socket.onSessionResumed(() => setSessionPaused(false));

      socket.connect();
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [chatId]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!socketRef.current || !isConnected) {
        setError("Not connected. Please wait and try again.");
        return;
      }
      if (!content.trim()) return;
      // Don't echo locally — wait for the server to broadcast the saved message.
      socketRef.current.sendMessage(content);
    },
    [isConnected]
  );

  return {
    messages,
    sendMessage,
    isConnected,
    connectionStatus,
    loadingHistory,
    error,
    sessionPaused,
  };
}

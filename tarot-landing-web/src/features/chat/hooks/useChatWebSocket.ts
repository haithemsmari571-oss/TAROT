import { useState, useEffect, useRef, useCallback } from "react";
import { ChatWebSocket, getChatMessages } from "../api/chatApi";
import { getToken } from "@/features/auth/utils";

export interface ChatMessage {
  id?: number;
  type?: string;
  content: string;
  user_id?: number;
  sender_id?: number;
  timestamp?: string;
  created_at?: string;
  chat_id?: number;
}

interface UseChatWebSocketReturn {
  messages: ChatMessage[];
  sendMessage: (content: string) => void;
  isConnected: boolean;
  error: string | null;
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  loadingMessages: boolean;
  onSessionEndingSoon: (callback: (secondsRemaining: number) => void) => void;
  onSessionEndedNoBalance: (callback: () => void) => void;
}

/**
 * Hook to manage WebSocket connection for real-time chat
 */
export const useChatWebSocket = (chatId: number | null): UseChatWebSocketReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("disconnected");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const wsRef = useRef<ChatWebSocket | null>(null);

  useEffect(() => {
    if (!chatId) {
      setConnectionStatus("disconnected");
      setMessages([]); // Clear messages when no chat selected
      return;
    }

    const token = getToken();
    if (!token) {
      setError("Authentication token not found. Please log in again.");
      setConnectionStatus("error");
      return;
    }

    // Fetch previous messages before connecting to WebSocket
    const fetchPreviousMessages = async () => {
      try {
        setLoadingMessages(true);
        const response = await getChatMessages(chatId, 10, -10);
        const previousMessages = response.messages || [];
        
        // Normalize message format
        const normalizedMessages = previousMessages.map(msg => ({
          id: msg.id,
          type: "message",
          content: msg.content,
          user_id: msg.sender_id,
          sender_id: msg.sender_id,
          timestamp: msg.created_at,
          chat_id: msg.chat_id,
        }));
        
        setMessages(normalizedMessages);
      } catch (err) {
        // Don't set error state, just ignore - WebSocket can still connect
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchPreviousMessages();

    // Create WebSocket connection
    setConnectionStatus("connecting");
    const ws = new ChatWebSocket(chatId, token);
    wsRef.current = ws;

    // Set up event handlers
    ws.onConnect(() => {
      setIsConnected(true);
      setConnectionStatus("connected");
      setError(null);
    });

    ws.onMessage((message: ChatMessage) => {
      setMessages((prev) => {
        // Normalize the message format to ensure sender_id is set
        const normalizedMessage = {
          ...message,
          sender_id: message.sender_id || message.user_id,
          user_id: message.user_id || message.sender_id,
          timestamp: message.timestamp || message.created_at,
          created_at: message.created_at || message.timestamp,
        };
        
        // Check if message already exists (by ID if available)
        if (normalizedMessage.id) {
          const exists = prev.some(m => m.id === normalizedMessage.id);
          if (exists) {
            return prev;
          }
        }
        
        return [...prev, normalizedMessage];
      });
    });

    ws.onError((err: any) => {
      const errorMessage = err.message || err.error || "WebSocket connection error";
      setError(errorMessage);
      setConnectionStatus("error");
      setIsConnected(false);
    });

    ws.onDisconnect(() => {
      setIsConnected(false);
      setConnectionStatus("disconnected");
    });

    // Connect
    ws.connect();

    // Cleanup on unmount or chatId change
    return () => {
      ws.disconnect();
      wsRef.current = null;
    };
  }, [chatId]);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || !isConnected) {
      setError("Not connected to chat. Please try again.");
      return;
    }

    if (!content.trim()) {
      return;
    }

    try {
      wsRef.current.sendMessage(content);
      // Don't add the message locally - wait for server echo to ensure it's saved
    } catch (err: any) {
      setError("Failed to send message. Please try again.");
    }
  }, [isConnected]);

  const onSessionEndingSoon = useCallback((callback: (secondsRemaining: number) => void) => {
    if (wsRef.current) {
      wsRef.current.onSessionEndingSoon(callback);
    }
  }, []);

  const onSessionEndedNoBalance = useCallback((callback: () => void) => {
    if (wsRef.current) {
      wsRef.current.onSessionEndedNoBalance(callback);
    }
  }, []);

  return {
    messages,
    sendMessage,
    isConnected,
    error,
    connectionStatus,
    loadingMessages,
    onSessionEndingSoon,
    onSessionEndedNoBalance,
  };
};

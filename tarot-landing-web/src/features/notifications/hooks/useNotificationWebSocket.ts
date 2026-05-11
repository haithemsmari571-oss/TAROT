import { useEffect, useRef, useCallback, useState } from "react";
import { NotificationWebSocket } from "../api/notificationApi";
import { NotificationMessage } from "../types/notification.types";

interface UseNotificationWebSocketOptions {
  token: string | null;
  enabled?: boolean;
  onNotification?: (notification: NotificationMessage) => void;
}

export const useNotificationWebSocket = ({
  token,
  enabled = true,
  onNotification,
}: UseNotificationWebSocketOptions) => {
  const wsRef = useRef<NotificationWebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const onNotificationRef = useRef(onNotification);

  // Update callback ref when it changes without triggering reconnection
  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  const connect = useCallback(() => {
    if (!token || !enabled) {
      console.log("Not connecting notification WebSocket - no token or disabled");
      return;
    }

    if (wsRef.current?.isConnected()) {
      console.log("Notification WebSocket already connected");
      return;
    }

    console.log("Creating notification WebSocket connection");
    const ws = new NotificationWebSocket(token);

    ws.onConnect(() => {
      console.log("Notification WebSocket connected");
      setIsConnected(true);
    });

    ws.onDisconnect(() => {
      console.log("Notification WebSocket disconnected");
      setIsConnected(false);
    });

    ws.onError((error) => {
      console.error("Notification WebSocket error:", error);
    });

    ws.onNotification((notification: NotificationMessage) => {
      console.log("Received notification:", notification);
      onNotificationRef.current?.(notification);
    });

    ws.connect();
    wsRef.current = ws;
  }, [token, enabled]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      console.log("Disconnecting notification WebSocket");
      wsRef.current.disconnect();
      wsRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    if (enabled && token) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [token, enabled, connect, disconnect]);

  return {
    isConnected,
    connect,
    disconnect,
  };
};

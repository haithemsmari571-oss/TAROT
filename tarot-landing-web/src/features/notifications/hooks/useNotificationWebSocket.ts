import { useEffect, useRef, useState } from "react";
import { NotificationWebSocket } from "../api/notificationApi";
import { NotificationMessage } from "../types/notification.types";

interface UseNotificationWebSocketOptions {
  token: string | null;
  enabled?: boolean;
  onNotification?: (notification: NotificationMessage) => void;
}

/**
 * Owns a single notification WebSocket for the session.
 *
 * The socket is (re)created ONLY when the token VALUE changes or auth toggles —
 * never on incidental re-renders. Previously the connection lived in an effect
 * whose cleanup closed it on every re-run, so any auth-context churn tore the
 * socket down and reopened it every few seconds (a perpetual reconnect storm
 * that kept admin pages "loading"). Here the disconnect happens only on real
 * logout or unmount.
 */
export const useNotificationWebSocket = ({
  token,
  enabled = true,
  onNotification,
}: UseNotificationWebSocketOptions) => {
  const wsRef = useRef<NotificationWebSocket | null>(null);
  const connectedTokenRef = useRef<string | null>(null);
  const onNotificationRef = useRef(onNotification);
  const [isConnected, setIsConnected] = useState(false);

  // Keep the handler current without disturbing the socket lifecycle.
  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    const shouldConnect = enabled && !!token;

    // Logged out / disabled → tear the socket down.
    if (!shouldConnect) {
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
        connectedTokenRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Already connected with THIS token → do nothing (this is the fix: benign
    // re-renders don't churn the socket).
    if (wsRef.current && connectedTokenRef.current === token) {
      return;
    }

    // Token changed (or first connect) → replace the socket.
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }

    const ws = new NotificationWebSocket(token as string);
    ws.onConnect(() => setIsConnected(true));
    ws.onDisconnect(() => setIsConnected(false));
    ws.onError((error) => console.error("Notification WebSocket error:", error));
    ws.onNotification((n: NotificationMessage) => onNotificationRef.current?.(n));
    ws.connect();
    wsRef.current = ws;
    connectedTokenRef.current = token;
    // No cleanup here — the socket must persist across re-runs. Teardown happens
    // in the unmount-only effect below, or when the token clears (above).
  }, [token, enabled]);

  // Close the socket only when the component actually unmounts.
  useEffect(() => {
    return () => {
      wsRef.current?.disconnect();
      wsRef.current = null;
      connectedTokenRef.current = null;
    };
  }, []);

  return { isConnected };
};

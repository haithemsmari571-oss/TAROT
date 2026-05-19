import axiosClient from "@/lib/axiosClient";
import { Notification, NotificationType } from "../types/notification.types";

export interface GetNotificationsParams {
  page?: number;
  limit?: number;
  type?: NotificationType;
  is_read?: boolean;
  tab?: "unread" | "chats" | "payments";
}

export interface PaginatedNotifications {
  notifications: Notification[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  unread_count: number;
}

/**
 * Get paginated notifications for the current user with filters
 */
export const getNotifications = async (
  params?: GetNotificationsParams
): Promise<PaginatedNotifications> => {
  const response = await axiosClient.get("/notifications/", { params });
  return response.data;
};

/**
 * Mark a notification as read
 */
export const markNotificationRead = async (
  notificationId: number
): Promise<void> => {
  await axiosClient.post(`/notifications/${notificationId}/read`);
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsRead = async (): Promise<{
  marked_count: number;
}> => {
  const response = await axiosClient.post("/notifications/read-all");
  return response.data;
};

/**
 * WebSocket connection for real-time notifications
 */
export class NotificationWebSocket {
  private ws: WebSocket | null = null;
  private token: string;
  private onNotificationCallback?: (notification: any) => void;
  private onConnectCallback?: () => void;
  private onDisconnectCallback?: () => void;
  private onErrorCallback?: (error: any) => void;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(token: string) {
    this.token = token;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log("Notification WebSocket already connected");
      return;
    }

    const wsUrl = import.meta.env.VITE_API_URL.replace("http", "ws");
    const fullWsUrl = `${wsUrl}/notifications/ws`;
    console.log("Connecting to Notification WebSocket:", fullWsUrl);
    this.ws = new WebSocket(fullWsUrl);

    this.ws.onopen = () => {
      console.log("Notification WebSocket opened, sending authentication...");
      this.reconnectAttempts = 0;
      
      // Authenticate immediately after connection
      this.ws?.send(
        JSON.stringify({
          type: "auth",
          token: this.token,
        })
      );

      // Start ping interval to keep connection alive
      this.startPingInterval();
    };

    this.ws.onmessage = (event) => {
      console.log("Notification WebSocket message received:", event.data);
      const data = JSON.parse(event.data);

      if (data.type === "auth_success") {
        console.log("Notification authentication successful!");
        this.onConnectCallback?.();
        return;
      }

      if (data.type === "pong") {
        // Received pong response, connection is alive
        return;
      }

      if (data.error) {
        console.error("Notification WebSocket error message:", data);
        this.onErrorCallback?.(data);
        return;
      }

      // Handle incoming notifications
      if (data.type === "notification") {
        this.onNotificationCallback?.(data);
      }
    };

    this.ws.onerror = (error) => {
      console.error("Notification WebSocket error event:", error);
      this.onErrorCallback?.(error);
    };

    this.ws.onclose = (event) => {
      console.log(
        "Notification WebSocket closed:",
        event.code,
        event.reason
      );
      this.stopPingInterval();
      this.onDisconnectCallback?.();

      // Attempt to reconnect
      this.attemptReconnect();
    };
  }

  private startPingInterval() {
    // Send ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);
  }

  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(
        "Max reconnection attempts reached for notification WebSocket"
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(
      `Attempting to reconnect notification WebSocket in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  onNotification(callback: (notification: any) => void) {
    this.onNotificationCallback = callback;
  }

  onConnect(callback: () => void) {
    this.onConnectCallback = callback;
  }

  onDisconnect(callback: () => void) {
    this.onDisconnectCallback = callback;
  }

  onError(callback: (error: any) => void) {
    this.onErrorCallback = callback;
  }

  disconnect() {
    this.stopPingInterval();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
    this.ws?.close();
    this.ws = null;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

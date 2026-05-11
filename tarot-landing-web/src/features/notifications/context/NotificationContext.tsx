import { createContext, useState, useCallback, useRef, type ReactNode } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useNotificationWebSocket } from "../hooks/useNotificationWebSocket";
import { NotificationMessage, NotificationType } from "../types/notification.types";

type NotificationHandler = (notification: NotificationMessage) => void;

export interface NotificationContextType {
  notifications: NotificationMessage[];
  unreadCount: number;
  isConnected: boolean;
  addNotification: (notification: NotificationMessage) => void;
  clearNotifications: () => void;
  markAllAsRead: () => void;
  onNotification: (type: NotificationType, handler: NotificationHandler) => () => void;
}

export const NotificationContext = createContext<
  NotificationContextType | undefined
>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider = ({ children }: NotificationProviderProps) => {
  const { token, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());
  const handlersRef = useRef<Map<NotificationType, Set<NotificationHandler>>>(new Map());

  const addNotification = useCallback((notification: NotificationMessage) => {
    setNotifications((prev) => [notification, ...prev]);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setReadNotificationIds(new Set());
  }, []);

  const markAllAsRead = useCallback(() => {
    const allIds = notifications.map((_, index) => index.toString());
    setReadNotificationIds(new Set(allIds));
  }, [notifications]);

  // Register a handler for a specific notification type
  const onNotification = useCallback((type: NotificationType, handler: NotificationHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);

    // Return cleanup function
    return () => {
      handlersRef.current.get(type)?.delete(handler);
    };
  }, []);

  // Handle incoming notifications
  const handleNotification = useCallback((notification: NotificationMessage) => {
    // Add to notifications list
    addNotification(notification);

    // Call registered handlers for this notification type
    const handlers = handlersRef.current.get(notification.notification_type);
    if (handlers) {
      handlers.forEach(handler => handler(notification));
    }
  }, [addNotification]);

  // Connect to notification WebSocket when user is authenticated
  const { isConnected } = useNotificationWebSocket({
    token,
    enabled: isAuthenticated,
    onNotification: handleNotification,
  });

  // Calculate unread count
  const unreadCount = notifications.filter((_, index) => !readNotificationIds.has(index.toString())).length;

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    isConnected,
    addNotification,
    clearNotifications,
    markAllAsRead,
    onNotification,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

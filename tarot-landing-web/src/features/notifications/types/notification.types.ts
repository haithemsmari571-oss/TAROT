export enum NotificationType {
  CHAT_ACCEPTED = "CHAT_ACCEPTED",
  CHAT_ENDED = "CHAT_ENDED",
  CHAT_REQUESTED = "CHAT_REQUESTED",
  CHAT_REQUEST_CANCELLED = "CHAT_REQUEST_CANCELLED",
  CHAT_PAUSED = "CHAT_PAUSED",
  CHAT_PAUSED_INSUFFICIENT_FUNDS = "CHAT_PAUSED_INSUFFICIENT_FUNDS",
  CHAT_RESUMED = "CHAT_RESUMED",
  MESSAGE_RECEIVED = "MESSAGE_RECEIVED",
  BALANCE_LOW = "BALANCE_LOW",
  SESSION_ENDING_SOON = "SESSION_ENDING_SOON",
  SESSION_ENDED_NO_BALANCE = "SESSION_ENDED_NO_BALANCE",
}

export interface Notification {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  data?: any;
  created_at: string;
  updated_at: string;
}

export interface NotificationMessage {
  type: "notification";
  notification_type: NotificationType;
  title: string;
  message: string;
  data?: any;
  timestamp: string;
}

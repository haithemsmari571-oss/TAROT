export enum NotificationType {
  CHAT_ACCEPTED = "CHAT_ACCEPTED",
  CHAT_ENDED = "CHAT_ENDED",
  CHAT_REQUESTED = "CHAT_REQUESTED",
  CHAT_REQUEST_CANCELLED = "CHAT_REQUEST_CANCELLED",
  CHAT_PAUSED = "CHAT_PAUSED",
  CHAT_PAUSED_INSUFFICIENT_FUNDS = "CHAT_PAUSED_INSUFFICIENT_FUNDS",
  CHAT_RESUMED = "CHAT_RESUMED",
  BALANCE_LOW = "BALANCE_LOW",
  INSUFFICIENT_BALANCE_AFTER_PAYMENT = "INSUFFICIENT_BALANCE_AFTER_PAYMENT",
  PAYMENT_SUCCESS_CHAT_NEEDS_MANUAL_RESUME = "PAYMENT_SUCCESS_CHAT_NEEDS_MANUAL_RESUME",
  RESUME_ERROR_AFTER_PAYMENT = "RESUME_ERROR_AFTER_PAYMENT",
  TOPUP_SUCCESS = "TOPUP_SUCCESS",
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

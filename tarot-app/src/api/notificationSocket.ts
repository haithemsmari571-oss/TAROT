// Global notifications WebSocket. Connects once while the user is signed in and
// surfaces server notifications (e.g. CHAT_ACCEPTED) anywhere in the app — this
// is what lets the client be "called" no matter which screen they're on.
//
// Protocol mirrors the website:
//   1. open  -> send { type: "auth", token }
//   2. expect { type: "auth_success" }
//   3. ping  -> { type: "ping" } every 30s, server replies { type: "pong" }
//   4. receive { type: "notification", notification_type, title, message, data }

const WS_BASE = "wss://askvalentina.co.uk";

export interface AppNotification {
  type: "notification";
  notification_type: string;
  title?: string;
  message?: string;
  data?: Record<string, any>;
  timestamp?: string;
}

type NotificationCb = (n: AppNotification) => void;

export class NotificationSocket {
  private ws: WebSocket | null = null;
  private readonly token: string;
  private onNotificationCb?: NotificationCb;
  private onDisconnectCb?: () => void;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closedByUs = false;

  constructor(token: string) {
    this.token = token;
  }

  connect() {
    this.closedByUs = false;
    this.ws = new WebSocket(`${WS_BASE}/api/notifications/ws`);

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ type: "auth", token: this.token }));
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (data.type === "auth_success" || data.type === "pong") return;
      if (data.type === "notification") {
        this.onNotificationCb?.(data as AppNotification);
      }
    };

    this.ws.onclose = () => {
      this.stopPing();
      if (!this.closedByUs) this.onDisconnectCb?.();
    };

    this.ws.onerror = () => {
      // onclose will follow; reconnection is handled by the provider.
    };
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  onNotification(cb: NotificationCb) {
    this.onNotificationCb = cb;
  }

  /** Fires when the socket closes unexpectedly (not via disconnect()). */
  onDisconnect(cb: () => void) {
    this.onDisconnectCb = cb;
  }

  /** True once the socket is closed by us (used to suppress reconnect). */
  get wasClosedByUs(): boolean {
    return this.closedByUs;
  }

  disconnect() {
    this.closedByUs = true;
    this.stopPing();
    this.ws?.close();
    this.ws = null;
  }
}

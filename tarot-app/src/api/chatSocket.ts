import type { ChatMessage } from "./chat";

// Same host as the REST client, ws:// scheme, matching the web path.
const WS_BASE = "wss://askvalentina.co.uk";

type MessageCb = (message: ChatMessage) => void;
type VoidCb = () => void;
type ErrorCb = (error: { message?: string; error?: string }) => void;

/** Payload of session_* events (session_info/started/grace/minute_charged). */
export interface SessionEventData {
  chat_id?: number;
  chat_status?: string;
  session_status?: string; // AWAITING_JOIN | ACTIVE | GRACE
  client_balance?: number;
  grace_seconds?: number;
  reader_name?: string;
  reason?: string; // session_ended_confirmed termination reason
}

/** Sender-only billing events for out-of-session (1 ⭐) messages. */
export interface MessageFeeData {
  fee?: number;
  client_balance?: number;
  reason?: string; // message_rejected: "INSUFFICIENT_BALANCE"
}

/**
 * Real-time chat WebSocket client. Protocol mirrors the website:
 *   1. open  -> send { type: "auth", token }
 *   2. expect { type: "auth_success" }
 *   3. send  { type: "message", content }
 *   4. receive message objects and session_* events
 */
export class ChatSocket {
  private ws: WebSocket | null = null;
  private readonly chatId: number;
  private readonly token: string;

  private onMessageCb?: MessageCb;
  private onConnectCb?: VoidCb;
  private onDisconnectCb?: VoidCb;
  private onErrorCb?: ErrorCb;
  private onSessionEndingSoonCb?: (secondsRemaining: number) => void;
  private onSessionEndedNoBalanceCb?: VoidCb;
  private onSessionPausedCb?: VoidCb;
  private onSessionResumedCb?: VoidCb;
  private onSessionStateCb?: (data: SessionEventData) => void;
  private onSessionGraceCb?: (data: SessionEventData) => void;
  private onSessionEndedCb?: (data: SessionEventData) => void;
  private onMessageFeeChargedCb?: (data: MessageFeeData) => void;
  private onMessageRejectedCb?: (data: MessageFeeData) => void;

  constructor(chatId: number, token: string) {
    this.chatId = chatId;
    this.token = token;
  }

  connect() {
    const url = `${WS_BASE}/api/chat/ws/${this.chatId}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ type: "auth", token: this.token }));
    };

    this.ws.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (data.type === "auth_success") {
        this.onConnectCb?.();
        return;
      }
      if (data.error) {
        this.onErrorCb?.(data);
        return;
      }
      if (data.event === "session_ending_soon") {
        this.onSessionEndingSoonCb?.(data.remaining_seconds);
        return;
      }
      if (data.event === "session_ended_no_balance") {
        this.onSessionEndedNoBalanceCb?.();
        return;
      }
      if (data.event === "session_paused") {
        this.onSessionPausedCb?.();
        return;
      }
      if (data.event === "session_resumed" || data.event === "session_started") {
        this.onSessionResumedCb?.();
        this.onSessionStateCb?.(data.data ?? {});
        return;
      }
      // Session snapshots that carry session_status (AWAITING_JOIN/ACTIVE/…):
      // the initial session_info on connect and each minute-boundary charge.
      if (
        data.event === "session_info" ||
        data.event === "session_minute_charged"
      ) {
        this.onSessionStateCb?.(data.data ?? {});
        return;
      }
      // Out-of-balance GRACE hold: meter frozen, top-up countdown running.
      if (data.event === "session_grace") {
        this.onSessionGraceCb?.(data.data ?? {});
        return;
      }
      // The server ended the session (NO_TOPUP, manual end, balance out…).
      if (data.event === "session_ended_confirmed") {
        this.onSessionEndedCb?.(data.data ?? {});
        return;
      }
      // Sender-only billing events for out-of-session (1 ⭐) messages.
      if (data.event === "message_fee_charged") {
        this.onMessageFeeChargedCb?.(data.data ?? {});
        return;
      }
      if (data.event === "message_rejected") {
        this.onMessageRejectedCb?.(data.data ?? {});
        return;
      }
      // Ignore other session lifecycle events (timer ticks, warnings, …).
      if (data.event) {
        return;
      }
      this.onMessageCb?.(data as ChatMessage);
    };

    this.ws.onerror = () => {
      this.onErrorCb?.({ message: "WebSocket connection error" });
    };

    this.ws.onclose = () => {
      this.onDisconnectCb?.();
    };
  }

  sendMessage(content: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "message", content }));
    }
  }

  onMessage(cb: MessageCb) {
    this.onMessageCb = cb;
  }
  onConnect(cb: VoidCb) {
    this.onConnectCb = cb;
  }
  onDisconnect(cb: VoidCb) {
    this.onDisconnectCb = cb;
  }
  onError(cb: ErrorCb) {
    this.onErrorCb = cb;
  }
  onSessionEndingSoon(cb: (secondsRemaining: number) => void) {
    this.onSessionEndingSoonCb = cb;
  }
  onSessionEndedNoBalance(cb: VoidCb) {
    this.onSessionEndedNoBalanceCb = cb;
  }
  onSessionPaused(cb: VoidCb) {
    this.onSessionPausedCb = cb;
  }
  onSessionResumed(cb: VoidCb) {
    this.onSessionResumedCb = cb;
  }
  /** session_info / session_started / session_minute_charged snapshots. */
  onSessionState(cb: (data: SessionEventData) => void) {
    this.onSessionStateCb = cb;
  }
  onSessionGrace(cb: (data: SessionEventData) => void) {
    this.onSessionGraceCb = cb;
  }
  onSessionEnded(cb: (data: SessionEventData) => void) {
    this.onSessionEndedCb = cb;
  }
  onMessageFeeCharged(cb: (data: MessageFeeData) => void) {
    this.onMessageFeeChargedCb = cb;
  }
  onMessageRejected(cb: (data: MessageFeeData) => void) {
    this.onMessageRejectedCb = cb;
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}

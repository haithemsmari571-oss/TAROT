import type { ChatMessage } from "./chat";

// Same host as the REST client, ws:// scheme, matching the web path.
const WS_BASE = "wss://askvalentina.co.uk";

type MessageCb = (message: ChatMessage) => void;
type VoidCb = () => void;
type ErrorCb = (error: { message?: string; error?: string }) => void;

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
      // Ignore other session lifecycle events for now (session_info, etc.)
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

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}

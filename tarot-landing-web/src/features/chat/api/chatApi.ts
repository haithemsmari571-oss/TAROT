import axiosClient from "@/lib/axiosClient";

export interface Chat {
  id: number;
  status: string;
  user_name: string;
  user_profile_pic_url: string;
  last_message: string;
  psychic_id?: number;
  psychic_details?: PsychicDetails;
  /** ISO string of last activity — used to order the admin Chats list newest-first. */
  updated_at?: string | null;
}

export interface PsychicDetails {
  id: number;
  username: string;
  email: string;
  price_per_second: number;
  bio: string;
  is_verified: boolean;
  is_online: boolean;
  profile_picture_url: string;
  categories: PsychicCategory[];
  availability: PsychicAvailability[];
}

export interface PsychicCategory {
  id: number;
  title: string;
}

export interface PsychicAvailability {
  id: number;
  day_of_the_week: string;
  start_at: string;
  end_at: string;
}

export interface ChatStartRequest {
  psychic_id: number;
  message: string;
}

export interface ChatStatusUpdate {
  status: "REQUESTED" | "ACTIVE" | "ENDED" | "PAUSED" | "ARCHIVED" | "BLOCKED";
}

export interface ChatMessage {
  id?: number;
  type?: "message";
  content: string;
  user_id?: number;
  sender_id?: number;
  timestamp?: string;
  created_at?: string;
  chat_id?: number;
}

/**
 * Get all chats for the current user based on their role:
 * - PSYCHIC: Only their chats (where they are the psychic)
 * - ADMIN/SUPERADMIN: All chats in the system
 * - USER: Their chats (where they are the client)
 */
export const getChats = async (): Promise<Chat[]> => {
  const response = await axiosClient.get("/chat/");
  return response.data;
};


/**
 * Get chats with full user details (for admin/psychic views)
 */
export const getMyChatsWithDetails = async (): Promise<any[]> => {
  const response = await axiosClient.get("/chat/my-chats");
  return response.data;
};

/**
 * Request a new chat session with a psychic
 */
export const requestChat = async (data: ChatStartRequest): Promise<void> => {
  await axiosClient.post("/chat/request", data);
};

/**
 * Get chat details including psychic token for admin access
 */
export interface ChatDetails {
  id: number;
  status: string;
  user_id: number;
  psychic_id: number;
  created_at: string;
  updated_at: string;
  psychic: {
    id: number;
    username: string;
    email: string;
    price_per_second: number;
  };
  client: {
    id: number;
    username: string;
    email: string;
    date_of_birth?: string | null;
  };
  psychic_token: string;
}

export const getChatDetails = async (chatId: number): Promise<ChatDetails> => {
  const response = await axiosClient.get(`/chat/${chatId}/details`);
  return response.data;
};

/**
 * Get messages for a chat with pagination
 */
export interface ChatMessagesResponse {
  messages: ChatMessage[];
  total: number;
  offset: number;
  limit: number;
}

export const getChatMessages = async (
  chatId: number,
  limit: number = 100,
  offset: number = 0,
  before_id?: number
): Promise<ChatMessagesResponse> => {
  const params: Record<string, any> = { limit, offset };
  if (before_id !== undefined) {
    params.before_id = before_id;
  }
  const response = await axiosClient.get(`/chat/${chatId}/messages`, { params });
  return response.data;
};

export interface ChatSessionTime {
  elapsed_seconds: number;
  estimated_cost: number;
  price_per_second: number;
  rate_per_minute?: number; // exact per-minute charge (price_per_second * 60)
  client_balance: number; // total spendable = credit + paid
  credit_balance?: number; // free welcome/gift credit remaining
  paid_balance?: number; // purchased balance remaining
  remaining_seconds?: number;
  remaining_minutes?: number; // whole minutes still affordable (incl. current)
  minutes_charged?: number; // minutes debited upfront so far
  session_status?: string; // "ACTIVE" | "AWAITING_JOIN" | "GRACE"
  grace_seconds_left?: number; // out-of-balance top-up countdown
  is_topping_up?: boolean;
}

/**
 * Get the current session duration and estimated cost for a chat
 */
export const getChatSessionTime = async (
  chatId: number
): Promise<ChatSessionTime> => {
  const response = await axiosClient.get(`/chat/${chatId}/session-time`);
  return response.data;
};

/**
 * Update chat status (accept/end chat)
 * Typically used by psychics to accept or end sessions
 */
export const updateChatStatus = async (
  chatId: number,
  data: ChatStatusUpdate
): Promise<void> => {
  await axiosClient.post(`/chat/${chatId}/status`, data);
};

/**
 * Client "joins" an accepted chat — anchors the billing timer to the moment the
 * client actually views the conversation (backend `mark_client_joined`). The
 * backend does NOT bill the gap between the psychic accepting and this call; it
 * re-anchors the session clock here. Idempotent server-side (safe to re-call).
 */
export const joinChat = async (chatId: number) => {
  const response = await axiosClient.post(`/chat/${chatId}/join`);
  return response.data;
};

/**
 * Pause a chat session for top-up (uses the topup endpoint — client-initiated,
 * opens Stripe checkout)
 */
export const pauseChat = async (chatId: number) => {
  const response = await axiosClient.post(`/chat/${chatId}/topup`);
  return response.data;
};

/**
 * Manually pause an active chat (psychic/admin) without the top-up/payment flow.
 * Pairs with resumeChat().
 */
export const pauseChatManual = async (chatId: number) => {
  const response = await axiosClient.post(`/chat/${chatId}/pause`);
  return response.data;
};

/**
 * Resume a paused chat session
 */
export const resumeChat = async (chatId: number) => {
  const response = await axiosClient.post(`/chat/${chatId}/resume`);
  return response.data;
};

/**
 * Get psychic details by ID
 */
export const getPsychicDetails = async (psychicId: number): Promise<PsychicDetails> => {
  const response = await axiosClient.get(`/psychic/${psychicId}`);
  return response.data;
};

/**
 * WebSocket connection for real-time chat
 */
export class ChatWebSocket {
  private ws: WebSocket | null = null;
  private chatId: number;
  private token: string;
  private onMessageCallback?: (message: any) => void;
  private onConnectCallback?: () => void;
  private onDisconnectCallback?: () => void;
  private onErrorCallback?: (error: any) => void;
  private onSessionEndingSoonCallback?: (secondsRemaining: number) => void;
  private onSessionEndedNoBalanceCallback?: () => void;

  constructor(chatId: number, token: string) {
    this.chatId = chatId;
    this.token = token;
  }

  connect() {
    const wsUrl = import.meta.env.VITE_API_URL.replace("http", "ws");
    const fullWsUrl = `${wsUrl}/api/chat/ws/${this.chatId}`;
    console.log("Connecting to WebSocket:", fullWsUrl);
    this.ws = new WebSocket(fullWsUrl);

    this.ws.onopen = () => {
      console.log("WebSocket opened, sending authentication...");
      // Authenticate immediately after connection
      this.ws?.send(
        JSON.stringify({
          type: "auth",
          token: this.token,
        })
      );
    };

    this.ws.onmessage = (event) => {
      console.log("WebSocket message received:", event.data);
      const data = JSON.parse(event.data);

      if (data.type === "auth_success") {
        console.log("Authentication successful!");
        this.onConnectCallback?.();
        return;
      }

      if (data.error) {
        console.error("WebSocket error message:", data);
        this.onErrorCallback?.(data);
        return;
      }

      // Handle session ending events
      if (data.event === "session_ending_soon") {
        console.log("Session ending soon:", data.remaining_seconds);
        this.onSessionEndingSoonCallback?.(data.remaining_seconds);
        return;
      }

      if (data.event === "session_ended_no_balance") {
        console.log("Session ended - no balance");
        this.onSessionEndedNoBalanceCallback?.();
        return;
      }

      this.onMessageCallback?.(data);
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error event:", error);
      this.onErrorCallback?.(error);
    };

    this.ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      this.onDisconnectCallback?.();
    };
  }

  sendMessage(content: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "message",
          content,
        })
      );
    }
  }

  onMessage(callback: (message: any) => void) {
    this.onMessageCallback = callback;
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

  onSessionEndingSoon(callback: (secondsRemaining: number) => void) {
    this.onSessionEndingSoonCallback = callback;
  }

  onSessionEndedNoBalance(callback: () => void) {
    this.onSessionEndedNoBalanceCallback = callback;
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

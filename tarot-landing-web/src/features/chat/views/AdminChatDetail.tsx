import React, { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "../../../theme";
import {
  getChatDetails,
  getChatMessages,
  getChatSessionTime,
  updateChatStatus,
  setResponseMode,
  getPendingDrafts,
  sendDraft,
  discardDraft,
  ChatMessage,
  ResponseMode,
} from "../api/chatApi";
import { useToast } from "../../../components/Toast/useToast";
import "../../../styles/starfield.css";

const AdminChatDetail = () => {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Disconnected");
  const [seconds, setSeconds] = useState(0);
  const [estimatedCost, setEstimatedCost] = useState(0);
  // True while the session is accepted but the client hasn't joined/viewed yet.
  // The backend freezes billing in this AWAITING_JOIN window, so the panel must
  // NOT tick a climbing time/earnings counter for a reading no one has opened.
  const [awaitingJoin, setAwaitingJoin] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [timerPaused, setTimerPaused] = useState(false);
  // Editable text of the AI draft currently shown in the review box.
  const [draftText, setDraftText] = useState("");
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const toastRef = useRef(toast);

  // Mutation to end chat
  const endChatMutation = useMutation({
    mutationFn: (chatId: number) => updateChatStatus(chatId, { status: "ENDED" }),
    onSuccess: () => {
      toastRef.current.success("Chat session ended successfully");
      queryClient.invalidateQueries({ queryKey: ["chatDetails", chatId] });
      setTimeout(() => navigate("/admin/chats"), 1500);
    },
    onError: (error: any) => {
      toastRef.current.error(error?.response?.data?.detail || "Failed to end chat session");
    },
  });

  // Update toast ref when it changes
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  // Fetch chat details
  const { data: chatDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["chatDetails", chatId],
    queryFn: () => getChatDetails(Number(chatId)),
    enabled: !!chatId,
  });

  // Fetch chat messages
  const { data: messagesResponse, isLoading: isLoadingMessages } = useQuery({
    queryKey: ["chatMessages", chatId],
    queryFn: () => getChatMessages(Number(chatId), 1000, 0),
    enabled: !!chatId,
  });

  // Fetch session time
  const { data: sessionTimeData } = useQuery({
    queryKey: ["chatSessionTime", chatId],
    queryFn: () => getChatSessionTime(Number(chatId)),
    enabled: !!chatId && chatDetails?.status === "ACTIVE",
    refetchInterval: false, // Don't auto-refetch, we'll use frontend timer
  });

  const pricePerSecond = sessionTimeData?.price_per_second || chatDetails?.psychic?.price_per_second || 0;
  const isChatActive = chatDetails?.status === "ACTIVE";
  const responseMode: ResponseMode = (chatDetails?.response_mode as ResponseMode) || "SABRI";

  // Poll pending AI drafts while the reading is live (hybrid review, or a
  // sabri-mode draft that fell back for manual review). Never shown to the client.
  const { data: pendingDrafts } = useQuery({
    queryKey: ["chatDrafts", chatId],
    queryFn: () => getPendingDrafts(Number(chatId)),
    enabled: !!chatId && isChatActive,
    refetchInterval: 4000,
  });
  const currentDraft = pendingDrafts && pendingDrafts.length > 0 ? pendingDrafts[0] : null;

  // Switch who answers this conversation (Human / Hybrid / Sabri).
  const setModeMutation = useMutation({
    mutationFn: (mode: ResponseMode) => setResponseMode(Number(chatId), mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatDetails", chatId] });
    },
    onError: (error: any) => {
      toastRef.current.error(error?.response?.data?.detail || "Failed to change mode");
    },
  });

  // Send the (optionally edited) AI draft as the reader.
  const sendDraftMutation = useMutation({
    mutationFn: ({ draftId, content }: { draftId: number; content: string }) =>
      sendDraft(Number(chatId), draftId, content),
    onSuccess: () => {
      setActiveDraftId(null);
      setDraftText("");
      queryClient.invalidateQueries({ queryKey: ["chatDrafts", chatId] });
      toastRef.current.success("Draft sent");
    },
    onError: (error: any) => {
      toastRef.current.error(error?.response?.data?.detail || "Failed to send draft");
    },
  });

  const discardDraftMutation = useMutation({
    mutationFn: (draftId: number) => discardDraft(Number(chatId), draftId),
    onSuccess: () => {
      setActiveDraftId(null);
      setDraftText("");
      queryClient.invalidateQueries({ queryKey: ["chatDrafts", chatId] });
    },
  });

  // Load a newly-arrived draft into the editable review box.
  useEffect(() => {
    if (currentDraft && currentDraft.id !== activeDraftId) {
      setActiveDraftId(currentDraft.id);
      setDraftText(currentDraft.draft_text);
    }
  }, [currentDraft, activeDraftId]);

  // Initialize messages from query
  useEffect(() => {
    if (messagesResponse?.messages) {
      setMessages(messagesResponse.messages);
    }
  }, [messagesResponse]);

  // Initialize session time from backend data
  useEffect(() => {
    if (sessionTimeData && isChatActive) {
      console.log("Initial session data:", sessionTimeData);
      setSeconds(sessionTimeData.total_seconds || sessionTimeData.elapsed_seconds || 0);
      setEstimatedCost(sessionTimeData.estimated_cost || 0);
      setAwaitingJoin((sessionTimeData as any).session_status === "AWAITING_JOIN");
    }
  }, [sessionTimeData, isChatActive]);

  // Initialize paused state from chat details (handles page refresh)
  useEffect(() => {
    if (chatDetails) {
      const shouldBePaused = chatDetails.status === 'PAUSED';
      setIsPaused(shouldBePaused);
      setTimerPaused(shouldBePaused);
      if (shouldBePaused) {
        setPauseReason("Session was paused (client balance insufficient)");
      }
    }
  }, [chatDetails?.status]);

  // Frontend timer - increments every second for ACTIVE chats
  useEffect(() => {
    // Stop timer if session ended, not active, paused, OR the client hasn't
    // joined yet (session frozen in AWAITING_JOIN — nothing to count).
    if (!isChatActive || !sessionTimeData || sessionEnded || timerPaused || awaitingJoin) return;

    const timer = setInterval(() => {
      setSeconds((s) => s + 1);
      setEstimatedCost((cost) => cost + pricePerSecond);
    }, 1000);

    return () => clearInterval(timer);
  }, [isChatActive, sessionTimeData, pricePerSecond, sessionEnded, timerPaused, awaitingJoin]);

  // Connect to WebSocket using psychic token
  useEffect(() => {
    if (!chatDetails?.psychic_token || !chatId) return;

    const wsUrl = import.meta.env.VITE_API_URL.replace("http", "ws");
    const fullWsUrl = `${wsUrl}/api/chat/ws/${chatId}`;
    
    setConnectionStatus("Connecting...");
    const ws = new WebSocket(fullWsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      ws.send(JSON.stringify({ 
        type: "auth", 
        token: chatDetails.psychic_token 
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("WebSocket message received:", data);

        if (data.type === "auth_success") {
          setIsConnected(true);
          setConnectionStatus("Connected as Psychic");
          toastRef.current.success("Connected to chat as psychic");
        } else if (data.type === "message" || data.content) {
          const newMessage: ChatMessage = {
            id: data.id || Date.now(),
            content: data.content,
            sender_id: data.sender_id || data.user_id,
            created_at: data.created_at || data.timestamp || new Date().toISOString(),
            chat_id: Number(chatId),
          };
          setMessages(prev => [...prev, newMessage]);
        } else if (data.type === "notification" && data.notification_type === "CHAT_ENDED") {
          // Handle CHAT_ENDED notification
          toastRef.current.info("Chat session has ended");
          setSessionEnded(true);
          queryClient.invalidateQueries({ queryKey: ["chatDetails", chatId] });
        } else if (data.event === "session_info") {
          // Live session snapshot — reflect whether the client has joined yet.
          const s = data.data || {};
          setAwaitingJoin(s.session_status === "AWAITING_JOIN");
          if (typeof s.elapsed_seconds === "number") setSeconds(s.elapsed_seconds);
          if (typeof s.estimated_cost === "number") setEstimatedCost(s.estimated_cost);
        } else if (data.event === "session_started") {
          // Client just joined — the clock is now genuinely running.
          setAwaitingJoin(false);
          if (typeof data.data?.elapsed_seconds === "number") setSeconds(data.data.elapsed_seconds);
        } else if (data.type === "balance_warning") {
          toastRef.current.warning(`Low balance: ${data.remaining_seconds}s remaining`);
        } else if (data.event === "session_paused") {
          console.log("Session paused:", data.data);
          setIsPaused(true);
          setPauseReason("Client balance insufficient");
          setTimerPaused(true);
          setSeconds(data.data.elapsed_seconds || seconds);
          toastRef.current.warning("Session paused - Client needs to top up balance");
          queryClient.invalidateQueries({ queryKey: ["chatDetails", chatId] });
        } else if (data.event === "session_resumed") {
          console.log("Session resumed:", data.data);
          setIsPaused(false);
          setPauseReason(null);
          setTimerPaused(false);
          setSeconds(data.data.elapsed_seconds || seconds);
          toastRef.current.success("Session resumed - Client added balance");
          queryClient.invalidateQueries({ queryKey: ["chatDetails", chatId] });
        } else if (data.type === "force_disconnect" || data.event === "session_ended_no_balance" || data.event === "session_ended") {
          toastRef.current.error(data.message || "Chat session has ended");
          setSessionEnded(true);
          queryClient.invalidateQueries({ queryKey: ["chatDetails", chatId] });
          ws.close();
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnectionStatus("Connection Error");
      toastRef.current.error("WebSocket connection error");
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
      setConnectionStatus("Disconnected");
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [chatDetails?.psychic_token, chatId]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (!input.trim() || !wsRef.current || !isConnected) return;

    const messageData = {
      type: "message",
      content: input.trim(),
    };

    wsRef.current.send(JSON.stringify(messageData));
    setInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Format time as HH:MM:SS
  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Handle end chat session
  const handleEndChat = () => {
    if (!chatId) return;
    
    const confirmed = window.confirm(
      "Are you sure you want to end this chat session? This action cannot be undone."
    );
    
    if (confirmed) {
      endChatMutation.mutate(Number(chatId));
    }
  };

  if (isLoadingDetails || isLoadingMessages) {
    return (
      <div className="flex items-center justify-center h-screen -m-4 md:-m-8 lg:-m-10" style={{ backgroundColor: COLORS.dark }}>
        <div className="fixed inset-0 pointer-events-none -z-10">
          <div className="starfield"></div>
          <div className="starfield-dense"></div>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10"
        >
          <Icon icon="eos-icons:loading" width={48} height={48} color={COLORS.primary} />
          <p className="text-white mt-4">Loading chat...</p>
        </motion.div>
      </div>
    );
  }

  if (!chatDetails) {
    return (
      <div className="flex items-center justify-center h-screen -m-4 md:-m-8 lg:-m-10" style={{ backgroundColor: COLORS.dark }}>
        <div className="fixed inset-0 pointer-events-none -z-10">
          <div className="starfield"></div>
          <div className="starfield-dense"></div>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center relative z-10"
        >
          <Icon icon="mdi:alert-circle" width={48} height={48} color={COLORS.error} />
          <p className="text-white mt-4">Chat not found</p>
          <button
            onClick={() => navigate("/admin/chats")}
            className="mt-6 px-6 py-3 rounded-xl font-bold transition-all"
            style={{
              background: `linear-gradient(135deg, ${COLORS.primary}30 0%, ${COLORS.secondary}30 100%)`,
              border: `1px solid ${COLORS.primary}50`,
              color: COLORS.neutralWhite,
            }}
          >
            Back to Chats
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col h-screen overflow-hidden -m-4 md:-m-8 lg:-m-10" 
      style={{ backgroundColor: COLORS.dark }}
    >
      {/* Starfield Background */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="starfield"></div>
        <div className="starfield-dense"></div>
      </div>

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 px-8 py-6 backdrop-blur-xl border-b"
        style={{
          background: `linear-gradient(135deg, ${COLORS.surface}CC 0%, ${COLORS.surfaceAccent}99 100%)`,
          borderColor: `${COLORS.neutralDarkGray}30`,
          boxShadow: `0 8px 32px ${COLORS.dark}60`,
        }}
      >
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate("/admin/chats")}
            className="p-3 rounded-xl transition-all hover:scale-110"
            style={{
              background: `${COLORS.neutralDarkGray}50`,
              border: `1px solid ${COLORS.neutralDarkGray}`,
            }}
          >
            <Icon icon="mdi:arrow-left" width={24} height={24} color={COLORS.neutralWhite} />
          </button>

          <div className="flex-1">
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">
              {chatDetails.client.username} <span style={{ color: COLORS.primary }}>↔</span> {chatDetails.psychic.username}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: isConnected ? COLORS.success : COLORS.error }}
              />
              <span className="text-sm" style={{ color: COLORS.neutralGray }}>
                {connectionStatus}
              </span>
              <span 
                className="text-xs px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider" 
                style={{ 
                  backgroundColor: isPaused 
                    ? `${COLORS.warning}20`
                    : chatDetails.status === 'ACTIVE' 
                      ? `${COLORS.success}20`
                      : `${COLORS.neutralDarkGray}50`,
                  color: isPaused 
                    ? COLORS.warning
                    : chatDetails.status === 'ACTIVE' 
                      ? COLORS.success
                      : COLORS.neutralGray,
                  border: isPaused 
                    ? `1px solid ${COLORS.warning}50`
                    : chatDetails.status === 'ACTIVE'
                      ? `1px solid ${COLORS.success}50`
                      : 'none'
                }}
              >
                {isPaused ? "⏸ PAUSED" : chatDetails.status}
              </span>
            </div>
          </div>

          {/* Session Stats - Only show if chat is ACTIVE and not paused */}
          {isChatActive && !isPaused && (
            <div className="flex items-center gap-6">
              <div
                className="px-6 py-3 rounded-2xl backdrop-blur-xl border"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.surface}80 0%, ${COLORS.surfaceAccent}60 100%)`,
                  borderColor: `${COLORS.neutralDarkGray}40`,
                }}
              >
                <div className="text-center">
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.neutralGray }}>
                    Session Time
                  </div>
                  <div className="text-2xl font-black tabular-nums mt-1" style={{ color: COLORS.primary }}>
                    {awaitingJoin ? "Waiting for client…" : formatTime(seconds)}
                  </div>
                </div>
              </div>

              <div
                className="px-6 py-3 rounded-2xl backdrop-blur-xl border"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.starGold}20 0%, ${COLORS.starGold}10 100%)`,
                  borderColor: `${COLORS.starGold}30`,
                }}
              >
                <div className="text-center">
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.neutralGray }}>
                    Est. Earnings
                  </div>
                  <div className="text-2xl font-black tabular-nums mt-1" style={{ color: COLORS.starGold }}>
                    £{estimatedCost.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Client balance — free welcome credit is spent before paid balance */}
              <div
                className="px-6 py-3 rounded-2xl backdrop-blur-xl border"
                style={{ background: `${COLORS.primary}12`, borderColor: `${COLORS.primary}30` }}
              >
                <div className="text-center">
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.neutralGray }}>
                    Client Balance
                  </div>
                  <div className="text-sm font-black tabular-nums mt-1 flex items-center gap-2 justify-center">
                    <span style={{ color: COLORS.starGold }}>£{(sessionTimeData?.credit_balance ?? 0).toFixed(2)} credit</span>
                    <span style={{ color: COLORS.neutralGray }}>·</span>
                    <span style={{ color: COLORS.neutralWhite }}>£{(sessionTimeData?.paid_balance ?? 0).toFixed(2)} paid</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs" style={{ color: COLORS.neutralGray }}>
                  Rate
                </div>
                <div className="text-sm font-bold mt-1" style={{ color: COLORS.starGold }}>
                  {pricePerSecond.toFixed(4)} pts/sec
                </div>
              </div>

              {/* End Session Button */}
              <button
                onClick={handleEndChat}
                disabled={endChatMutation.isPending}
                className="px-6 py-3 rounded-2xl backdrop-blur-xl border transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.error}30 0%, ${COLORS.error}20 100%)`,
                  borderColor: `${COLORS.error}50`,
                }}
              >
                <Icon 
                  icon={endChatMutation.isPending ? "eos-icons:loading" : "mdi:stop-circle"} 
                  width={20} 
                  height={20} 
                  color={COLORS.error} 
                />
                <span className="text-sm font-bold uppercase tracking-wider" style={{ color: COLORS.error }}>
                  {endChatMutation.isPending ? "Ending..." : "End Session"}
                </span>
              </button>
            </div>
          )}

          {/* Show paused stats instead */}
          {isPaused && (
            <div className="flex items-center gap-4">
              <div
                className="px-6 py-3 rounded-2xl backdrop-blur-xl border"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.warning}20 0%, ${COLORS.warning}10 100%)`,
                  borderColor: `${COLORS.warning}30`,
                }}
              >
                <div className="text-center">
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.neutralGray }}>
                    Paused at
                  </div>
                  <div className="text-2xl font-black tabular-nums mt-1" style={{ color: COLORS.warning }}>
                    {formatTime(seconds)}
                  </div>
                </div>
              </div>

              <div
                className="px-6 py-3 rounded-2xl backdrop-blur-xl border"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.starGold}20 0%, ${COLORS.starGold}10 100%)`,
                  borderColor: `${COLORS.starGold}30`,
                }}
              >
                <div className="text-center">
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.neutralGray }}>
                    Est. Earnings (Paused)
                  </div>
                  <div className="text-2xl font-black tabular-nums mt-1" style={{ color: COLORS.starGold }}>
                    £{estimatedCost.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-3 rounded-2xl backdrop-blur-xl border" style={{
                background: `${COLORS.warning}10`,
                borderColor: `${COLORS.warning}30`,
              }}>
                <Icon icon="solar:clock-circle-bold" width={20} height={20} style={{ color: COLORS.warning }} />
                <span className="text-sm font-bold" style={{ color: COLORS.warning }}>
                  Waiting for client...
                </span>
              </div>

              {/* End Session Button for paused chats */}
              <button
                onClick={handleEndChat}
                disabled={endChatMutation.isPending}
                className="px-6 py-3 rounded-2xl backdrop-blur-xl border transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.error}30 0%, ${COLORS.error}20 100%)`,
                  borderColor: `${COLORS.error}50`,
                }}
              >
                <Icon
                  icon={endChatMutation.isPending ? "eos-icons:loading" : "mdi:stop-circle"}
                  width={20}
                  height={20}
                  color={COLORS.error}
                />
                <span className="text-sm font-bold uppercase tracking-wider" style={{ color: COLORS.error }}>
                  {endChatMutation.isPending ? "Ending..." : "End Session"}
                </span>
              </button>
            </div>
          )}

          {/* If not active and not paused, show simple status */}
          {!isChatActive && !isPaused && (
            <div className="text-right">
              <div className="text-sm" style={{ color: COLORS.neutralGray }}>
                Rate: <span className="font-bold" style={{ color: COLORS.starGold }}>
                  {chatDetails.psychic.price_per_second} pts/sec
                </span>
              </div>
            </div>
          )}
        </div>
      </motion.header>

      {/* Admin Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 px-8 py-4 backdrop-blur-xl border-b flex items-center justify-between gap-3"
        style={{
          background: `linear-gradient(135deg, ${COLORS.starGold}20 0%, ${COLORS.starGold}10 100%)`,
          borderColor: `${COLORS.starGold}30`,
        }}
      >
        <div className="flex items-center gap-3">
          <Icon icon="mdi:shield-account" width={20} height={20} color={COLORS.starGold} />
          <span className="text-sm font-bold" style={{ color: COLORS.starGold }}>
            Admin Mode: Sending messages as {chatDetails.psychic.username}
          </span>
        </div>

        {/* Per-conversation response mode: Human / Hybrid / Sabri */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.neutralGray }}>
            Replies:
          </span>
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: `${COLORS.primary}40` }}>
            {(["HUMAN", "HYBRID", "SABRI"] as ResponseMode[]).map((mode) => {
              const active = responseMode === mode;
              const label = mode === "HUMAN" ? "Human" : mode === "HYBRID" ? "Hybrid" : "Sabri";
              return (
                <button
                  key={mode}
                  onClick={() => !active && setModeMutation.mutate(mode)}
                  disabled={setModeMutation.isPending}
                  title={
                    mode === "HUMAN"
                      ? "You type every reply (no AI)"
                      : mode === "HYBRID"
                        ? "AI drafts, Sabri checks — you review & send"
                        : "AI drafts, Sabri checks, auto-sends on a clean pass"
                  }
                  className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                  style={{
                    background: active
                      ? `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`
                      : "transparent",
                    color: active ? COLORS.neutralWhite : COLORS.neutralGray,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Paused State Banner */}
      {isPaused && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 mx-8 mt-6 p-4 rounded-xl border backdrop-blur-xl"
          style={{
            background: `linear-gradient(135deg, ${COLORS.warning}20 0%, ${COLORS.error}10 100%)`,
            borderColor: `${COLORS.warning}40`,
          }}
        >
          <div className="flex items-center gap-3">
            <Icon 
              icon="solar:pause-circle-bold-duotone" 
              width={32} 
              height={32} 
              style={{ color: COLORS.warning }}
              className="animate-pulse"
            />
            <div className="flex-1">
              <h4 className="text-white font-bold text-sm mb-1">
                ⚠️ Session Paused
              </h4>
              <p style={{ color: `${COLORS.neutralWhite}90` }} className="text-xs">
                {pauseReason || "Client is adding balance. Session will resume shortly."}
              </p>
              <p style={{ color: COLORS.neutralGray }} className="text-xs mt-1">
                Timer stopped at {formatTime(seconds)}
              </p>
            </div>
            <div 
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider"
              style={{
                background: `${COLORS.warning}30`,
                color: COLORS.warning,
                border: `1px solid ${COLORS.warning}50`,
              }}
            >
              PAUSED
            </div>
            <button
              onClick={handleEndChat}
              disabled={endChatMutation.isPending}
              className="px-5 py-2.5 rounded-xl border transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                background: `linear-gradient(135deg, ${COLORS.error}30 0%, ${COLORS.error}20 100%)`,
                borderColor: `${COLORS.error}50`,
              }}
            >
              <Icon 
                icon={endChatMutation.isPending ? "eos-icons:loading" : "mdi:stop-circle"} 
                width={18} 
                height={18} 
                color={COLORS.error} 
              />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.error }}>
                {endChatMutation.isPending ? "Ending..." : "End Session"}
              </span>
            </button>
          </div>
        </motion.div>
      )}

      {/* Messages Container */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex-1 relative z-10 overflow-hidden px-8 py-6"
      >
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto overflow-x-hidden rounded-3xl p-6 backdrop-blur-xl border"
          style={{
            background: `linear-gradient(135deg, ${COLORS.surface}80 0%, ${COLORS.surfaceAccent}60 100%)`,
            borderColor: `${COLORS.neutralDarkGray}30`,
            boxShadow: `0 8px 32px ${COLORS.dark}60, inset 0 1px 0 ${COLORS.neutralWhite}05`,
          }}
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <Icon icon="mdi:message-outline" width={64} height={64} color={COLORS.neutralGray} />
              <p className="mt-4 text-lg" style={{ color: COLORS.neutralGray }}>
                No messages yet
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, index) => {
                const isFromPsychic = msg.sender_id === chatDetails.psychic_id;
                return (
                  <motion.div
                    key={msg.id || index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className={`flex ${isFromPsychic ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className="max-w-[70%] px-5 py-3 rounded-2xl backdrop-blur-xl border"
                      style={{
                        background: isFromPsychic
                          ? `linear-gradient(135deg, ${COLORS.primary}40 0%, ${COLORS.secondary}30 100%)`
                          : `linear-gradient(135deg, ${COLORS.surfaceAccent}60 0%, ${COLORS.surface}80 100%)`,
                        borderColor: isFromPsychic ? `${COLORS.primary}50` : `${COLORS.neutralDarkGray}40`,
                        boxShadow: `0 4px 16px ${COLORS.dark}40`,
                      }}
                    >
                      <p className="text-white text-base leading-relaxed break-words">
                        {msg.content}
                      </p>
                      <span className="text-xs mt-2 block" style={{ color: COLORS.neutralGray }}>
                        {msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ""}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* AI Draft Review — hybrid mode, or a sabri-mode draft that fell back.
          The client never sees this; it only reaches the client if you Send. */}
      {currentDraft && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 mx-8 mb-2 mt-4 p-4 rounded-2xl border backdrop-blur-xl"
          style={{
            background: `linear-gradient(135deg, ${COLORS.secondary}20 0%, ${COLORS.primary}10 100%)`,
            borderColor: `${COLORS.secondary}50`,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:robot-outline" width={18} height={18} color={COLORS.secondary} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.secondary }}>
                Valentina draft
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider"
                style={{
                  background: currentDraft.sabri_passed ? `${COLORS.success}25` : `${COLORS.warning}25`,
                  color: currentDraft.sabri_passed ? COLORS.success : COLORS.warning,
                }}
              >
                {currentDraft.sabri_passed ? "Sabri: passed" : "Sabri: needs review"}
              </span>
              <span className="text-[10px]" style={{ color: COLORS.neutralGray }}>
                {currentDraft.attempts} attempt{currentDraft.attempts === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {currentDraft.sabri_flags.length > 0 && (
            <ul className="mb-2 space-y-1">
              {currentDraft.sabri_flags.map((flag, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: COLORS.warning }}>
                  <Icon icon="mdi:alert-circle-outline" width={14} height={14} className="mt-0.5" />
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
          )}

          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl border resize-none outline-none text-sm"
            style={{
              background: `${COLORS.dark}80`,
              borderColor: `${COLORS.neutralDarkGray}50`,
              color: COLORS.neutralWhite,
            }}
          />

          <div className="flex items-center justify-end gap-3 mt-3">
            <button
              onClick={() => discardDraftMutation.mutate(currentDraft.id)}
              disabled={discardDraftMutation.isPending}
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
              style={{ background: `${COLORS.neutralDarkGray}50`, color: COLORS.neutralGray }}
            >
              Discard
            </button>
            <button
              onClick={() =>
                draftText.trim() &&
                sendDraftMutation.mutate({ draftId: currentDraft.id, content: draftText.trim() })
              }
              disabled={!draftText.trim() || sendDraftMutation.isPending}
              className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-2"
              style={{
                background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
                color: COLORS.neutralWhite,
              }}
            >
              <Icon
                icon={sendDraftMutation.isPending ? "eos-icons:loading" : "mdi:send"}
                width={16}
                height={16}
              />
              {sendDraftMutation.isPending ? "Sending..." : "Send as reader"}
            </button>
          </div>
        </motion.div>
      )}

      {/* Input Area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="relative z-10 px-8 py-6 backdrop-blur-xl border-t"
        style={{
          background: `linear-gradient(135deg, ${COLORS.surface}CC 0%, ${COLORS.surfaceAccent}99 100%)`,
          borderColor: `${COLORS.neutralDarkGray}30`,
        }}
      >
        <div className="flex items-end gap-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isConnected ? "Type your message..." : "Connecting..."}
            disabled={!isConnected}
            rows={2}
            className="flex-1 px-5 py-4 rounded-2xl backdrop-blur-xl border resize-none outline-none transition-all"
            style={{
              background: `${COLORS.dark}80`,
              borderColor: `${COLORS.neutralDarkGray}50`,
              color: COLORS.neutralWhite,
              opacity: !isConnected ? 0.5 : 1,
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || !isConnected}
            className="px-6 py-4 rounded-2xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
              color: COLORS.neutralWhite,
              boxShadow: `0 4px 20px ${COLORS.primary}40`,
            }}
          >
            <Icon icon="mdi:send" width={24} height={24} />
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminChatDetail;

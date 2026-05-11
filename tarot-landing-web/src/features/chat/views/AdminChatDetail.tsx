import React, { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "../../../theme";
import { getChatDetails, getChatMessages, getChatSessionTime, updateChatStatus, ChatMessage } from "../api/chatApi";
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
  const [sessionEnded, setSessionEnded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [timerPaused, setTimerPaused] = useState(false);
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
    // Stop timer if session ended, chat is not active, OR if paused
    if (!isChatActive || !sessionTimeData || sessionEnded || timerPaused) return;

    const timer = setInterval(() => {
      setSeconds((s) => s + 1);
      setEstimatedCost((cost) => cost + pricePerSecond);
    }, 1000);

    return () => clearInterval(timer);
  }, [isChatActive, sessionTimeData, pricePerSecond, sessionEnded, timerPaused]);

  // Connect to WebSocket using psychic token
  useEffect(() => {
    if (!chatDetails?.psychic_token || !chatId) return;

    const wsUrl = import.meta.env.VITE_API_URL.replace("http", "ws");
    const fullWsUrl = `${wsUrl}/chat/ws/${chatId}`;
    
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
                    Est. Earnings
                  </div>
                  <div className="text-2xl font-black tabular-nums mt-1" style={{ color: COLORS.starGold }}>
                    ${estimatedCost.toFixed(2)}
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
                    ${estimatedCost.toFixed(2)}
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
        className="relative z-10 px-8 py-4 backdrop-blur-xl border-b flex items-center gap-3"
        style={{
          background: `linear-gradient(135deg, ${COLORS.starGold}20 0%, ${COLORS.starGold}10 100%)`,
          borderColor: `${COLORS.starGold}30`,
        }}
      >
        <Icon icon="mdi:shield-account" width={20} height={20} color={COLORS.starGold} />
        <span className="text-sm font-bold" style={{ color: COLORS.starGold }}>
          Admin Mode: Sending messages as {chatDetails.psychic.username}
        </span>
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

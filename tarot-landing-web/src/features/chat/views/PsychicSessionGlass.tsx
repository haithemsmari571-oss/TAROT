import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { useQueryClient } from "@tanstack/react-query";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { useChats } from "../hooks/useChats";
import { updateChatStatus, getChatMessages, getChatSessionTime, getChatDetails } from "../api/chatApi";
import { useToast } from "../../../components/Toast/useToast";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { UserRole } from "@/features/auth/types/auth.types";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { NotificationType } from "@/features/notifications/types/notification.types";
import { useChatSessionState } from "../hooks/useChatSessionState";
import { useChatEventToasts } from "../hooks/useChatEventToasts";
import { GlassChatCard } from "../components/GlassChatCard";
import { GlassChatListItem } from "../components/GlassChatListItem";
import { GlassMessageBubble } from "../components/GlassMessageBubble";
import { GlassChatInput } from "../components/GlassChatInput";
import { GlassChatSidebar } from "../components/GlassChatSidebar";
import { SessionSummaryModal } from "../components/SessionSummaryModal";
import { useChatFacade } from "../hooks/useChatFacade";
import { useChatEvents } from "../hooks/useChatEvents";
import { ChatEventType, ChatMessage } from "../core/ChatEventTypes";

const PsychicSessionGlass = () => {
  const { chats, loading, error, refetch } = useChats();
  const toast = useToast();
  const { user } = useAuth();

  // Check if current user is admin/superadmin
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPERADMIN;
  const { onNotification } = useNotifications();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<"queue" | "chat">("queue");
  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  const [processingChats, setProcessingChats] = useState<Set<number>>(
    new Set()
  );
  const [input, setInput] = useState("");
  const [isTerminating, setIsTerminating] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "ALL" | "REQUESTED" | "ACTIVE" | "ENDED"
  >("ALL");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSessionSummaryModal, setShowSessionSummaryModal] = useState(false);
  const [sessionSummaryData, setSessionSummaryData] = useState({
    duration: 0,
    cost: 0,
    endReason: "",
  });

  // Admin-specific: Store psychic_token for impersonation
  const [psychicToken, setPsychicToken] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);

  const currentChat = chats.find((c) => c.id === selectedChat);

  // Fetch psychic_token when admin enters a chat
  useEffect(() => {
    if (isAdmin && selectedChat && activeView === "chat") {
      getChatDetails(selectedChat)
        .then((details) => {
          console.log('[PsychicSessionGlass] Fetched psychic_token for admin:', details.psychic_token ? 'received' : 'not received');
          setPsychicToken(details.psychic_token);
        })
        .catch((err) => {
          console.error('[PsychicSessionGlass] Failed to fetch chat details:', err);
          toast.error('Failed to fetch chat details');
        });
    } else if (!isAdmin || !selectedChat || activeView !== "chat") {
      // Clear token when leaving chat or if not admin
      setPsychicToken(null);
    }
  }, [isAdmin, selectedChat, activeView, toast]);

  // Chat session state management with WebSocket (for psychic role)
  const {
    sessionState,
    dispatch,
    isActive: isChatActive,
    isPaused,
    isEnded
  } = useChatSessionState({
    chatId: activeView === "chat" ? selectedChat : null,
    currentChatStatus: currentChat?.status, // Pass current status so hook knows to fetch
    userRole: 'PSYCHIC',
    onSessionAccepted: () => {
      // Optimistically update the chat status in cache
      if (selectedChat) {
        queryClient.setQueryData<any[]>(["chats"], (oldChats) => {
          if (!oldChats) return oldChats;
          return oldChats.map(chat =>
            chat.id === selectedChat
              ? { ...chat, status: 'ACTIVE' as const }
              : chat
          );
        });
      }

      // Force immediate refetch
      refetch();
    },
    onSessionPaused: () => {
      if (selectedChat) {
        queryClient.setQueryData<any[]>(["chats"], (oldChats) => {
          if (!oldChats) return oldChats;
          return oldChats.map(chat =>
            chat.id === selectedChat
              ? { ...chat, status: 'PAUSED' as const }
              : chat
          );
        });
      }

      refetch();
    },
    onSessionEnded: () => {
      console.log('[PsychicSessionGlass] onSessionEnded called, refetching chats...');

      if (selectedChat) {
        console.log('[PsychicSessionGlass] Optimistically updating chat', selectedChat, 'to ENDED');
        queryClient.setQueryData<any[]>(["chats"], (oldChats) => {
          if (!oldChats) return oldChats;
          return oldChats.map(chat =>
            chat.id === selectedChat
              ? { ...chat, status: 'ENDED' as const }
              : chat
          );
        });

        console.log('[PsychicSessionGlass] Invalidating chat queries...');
        queryClient.invalidateQueries({ queryKey: ["chats"] });
      }

      console.log('[PsychicSessionGlass] Calling refetch()...');
      refetch();

      if (activeView === "chat") {
        setActiveView("queue");
        setSelectedChat(null);
      }
    },
  });

  // WebSocket notification handlers for real-time updates
  const handleChatRequested = useCallback((notification: any) => {
    console.log("Chat requested notification:", notification);
    toast.info("New chat request received!");
    // Invalidate and refetch chats to show the new request
    queryClient.invalidateQueries({ queryKey: ["chats"] });
  }, [toast, queryClient]);

  const handleChatEnded = useCallback((notification: any) => {
    console.log("Chat ended notification:", notification);
    const endedChatId = notification.data?.chat_id;

    if (endedChatId) {
      queryClient.setQueryData<any[]>(["chats"], (oldChats) => {
        if (!oldChats) return oldChats;
        return oldChats.map(chat =>
          chat.id === endedChatId
            ? { ...chat, status: 'ENDED' as const }
            : chat
        );
      });
    }

    // Force immediate refetch to ensure consistency with backend
    refetch();

    // If currently viewing the ended chat, return to queue
    if (selectedChat === endedChatId && activeView === "chat") {
      setActiveView("queue");
      setSelectedChat(null);
    }
  }, [toast, queryClient, selectedChat, activeView, refetch]);

  // Register notification handlers
  useEffect(() => {
    const unsubscribeRequested = onNotification(
      NotificationType.CHAT_REQUESTED,
      handleChatRequested
    );
    const unsubscribeEnded = onNotification(
      NotificationType.CHAT_ENDED,
      handleChatEnded
    );

    return () => {
      unsubscribeRequested();
      unsubscribeEnded();
    };
  }, [onNotification, handleChatRequested, handleChatEnded]);
  const canParticipate =
    currentChat &&
    user &&
    (user.role === "PSYCHIC" || user.role === "USER" || user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN);

  // DEBUG: Log session state and derived values on every render
  console.log('[PsychicSessionGlass RENDER] ===================');
  console.log('[PsychicSessionGlass RENDER] selectedChat:', selectedChat);
  console.log('[PsychicSessionGlass RENDER] activeView:', activeView);
  console.log('[PsychicSessionGlass RENDER] sessionState:', {
    chatId: sessionState.chatId,
    status: sessionState.status,
    elapsedSeconds: sessionState.elapsedSeconds,
    estimatedCost: sessionState.estimatedCost,
    clientBalance: sessionState.clientBalance,
    remainingSeconds: sessionState.remainingSeconds,
    psychicRatePerSecond: sessionState.psychicRatePerSecond,
    sessionStartedAt: sessionState.sessionStartedAt,
  });
  console.log('[PsychicSessionGlass RENDER] isChatActive:', isChatActive);
  console.log('[PsychicSessionGlass RENDER] currentChat?.status:', currentChat?.status);
  console.log('[PsychicSessionGlass RENDER] ===================');

  // State for messages
  const [wsMessages, setWsMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadedOlderMessages, setLoadedOlderMessages] = useState<any[]>([]);
  const [allMessages, setAllMessages] = useState<any[]>([]);

  // ChatFacade for WebSocket connection
  // For admins, use psychic_token to impersonate the psychic
  useChatEventToasts(
    activeView === "chat" ? selectedChat : null,
    user?.role === UserRole.ADMIN || user?.role === UserRole.SUPERADMIN ? 'PSYCHIC' : 'PSYCHIC'
  );

  const { facade, isConnected, error: wsError } = useChatFacade({
    role: 'psychic',
    chatId: activeView === "chat" && canParticipate ? selectedChat : null,
    autoConnect: true,
    customToken: isAdmin ? psychicToken : null,
  });

  // Connection status for backward compatibility
  const connectionStatus = isConnected ? "connected" : "disconnected";

  // Load previous messages
  const loadPreviousMessages = useCallback(async () => {
    if (!selectedChat) return;

    try {
      setLoadingMessages(true);
      const response = await getChatMessages(selectedChat, 10, -10);
      const previousMessages = response.messages || [];

      const normalizedMessages = previousMessages.map(msg => ({
        id: msg.id,
        type: msg.is_system ? "system" : "message",
        content: msg.content,
        user_id: msg.sender_id,
        sender_id: msg.sender_id,
        timestamp: msg.created_at,
        created_at: msg.created_at,
        chat_id: msg.chat_id,
        is_system: msg.is_system,
      }));

      setWsMessages(normalizedMessages);
      if (response.total <= 10) {
        setHasMoreMessages(false);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, [selectedChat]);

  // Stable event handlers using useCallback
  const handleMessageReceived = useCallback(({ message }: { message: ChatMessage }) => {
    console.log('[PsychicSessionGlass] Message received handler called:', message);
    setWsMessages(prev => {
      // Avoid duplicates
      if (prev.some(m => m.id === message.id)) {
        console.log('[PsychicSessionGlass] Duplicate message, skipping:', message.id);
        return prev;
      }
      console.log('[PsychicSessionGlass] Adding new message to state:', message.id);
      return [...prev, message];
    });
  }, []);

  const handleSessionPaused = useCallback(({ reason, elapsed_seconds }: { reason?: string; elapsed_seconds?: number }) => {
    console.log('[PsychicSessionGlass] SESSION_PAUSED event received:', { reason, elapsed_seconds });

    dispatch({
      type: 'CHAT_PAUSED',
      payload: {
        reason: reason || 'Client balance insufficient',
        elapsed_seconds: elapsed_seconds || sessionState.elapsedSeconds,
        estimated_cost: sessionState.estimatedCost,
      }
    });

    if (selectedChat) {
      queryClient.setQueryData<any[]>(["chats"], (oldChats) => {
        if (!oldChats) return oldChats;
        return oldChats.map(chat =>
          chat.id === selectedChat
            ? { ...chat, status: 'PAUSED' as const }
            : chat
        );
      });
    }
  }, [dispatch, sessionState.elapsedSeconds, sessionState.estimatedCost, selectedChat, queryClient]);

  const handleSessionResumed = useCallback(({ elapsed_seconds, remaining_seconds, client_balance, rate_per_second }: any) => {
    console.log('[PsychicSessionGlass] SESSION_RESUMED event received:', { elapsed_seconds, remaining_seconds, client_balance, rate_per_second });

    dispatch({
      type: 'CHAT_RESUMED',
      payload: {
        client_balance: client_balance || sessionState.clientBalance || 0,
        elapsed_seconds,
        remaining_seconds,
        rate_per_second,
      }
    });

    if (selectedChat) {
      queryClient.setQueryData<any[]>(["chats"], (oldChats) => {
        if (!oldChats) return oldChats;
        return oldChats.map(chat =>
          chat.id === selectedChat
            ? { ...chat, status: 'ACTIVE' as const }
            : chat
        );
      });
    }
  }, [dispatch, sessionState.clientBalance, selectedChat, queryClient]);

  const handleSessionEndingSoon = useCallback(({ remainingSeconds }: { remainingSeconds: number }) => {
    console.log(`[PsychicSessionGlass] Client's session ending in ${remainingSeconds} seconds`);
  }, []);

  const handleBalanceWarning = useCallback(({ remainingSeconds }: { remainingSeconds: number }) => {
    console.log(`[PsychicSessionGlass] Client's balance low: ${remainingSeconds}s remaining`);
    toast.info("Client's balance is running low");
  }, [toast]);

  const handleBalanceInsufficient = useCallback(() => {
    console.log("[PsychicSessionGlass] Client's session ended - insufficient balance for 10 seconds");

    setSessionSummaryData({
      duration: sessionState.elapsedSeconds,
      cost: sessionState.estimatedCost,
      endReason: "Session ended - client's insufficient balance (less than 10 seconds remaining)",
    });

    setShowSessionSummaryModal(true);

    queryClient.invalidateQueries({ queryKey: ["chats"] });
  }, [sessionState.elapsedSeconds, sessionState.estimatedCost, queryClient]);

  const handleSessionEndedWebSocket = useCallback(({ reason }: { reason?: string }) => {
    console.log("[PsychicSessionGlass] SESSION_ENDED WebSocket event received, reason:", reason);

    dispatch({
      type: 'CHAT_ENDED',
      payload: {
        elapsed_seconds: sessionState.elapsedSeconds,
        estimated_cost: sessionState.estimatedCost,
        reason: reason || 'Session ended',
      }
    });

    const wasDeclined = sessionState.elapsedSeconds === 0 && sessionState.estimatedCost === 0;

    if (!wasDeclined) {
      setSessionSummaryData({
        duration: sessionState.elapsedSeconds,
        cost: sessionState.estimatedCost,
        endReason: reason === 'insufficient_balance'
          ? "Session ended - client's insufficient balance"
          : reason || "Session ended",
      });

      setShowSessionSummaryModal(true);
    }

    if (selectedChat) {
      queryClient.setQueryData<any[]>(["chats"], (oldChats) => {
        if (!oldChats) return oldChats;
        return oldChats.map(chat =>
          chat.id === selectedChat
            ? { ...chat, status: 'ENDED' as const }
            : chat
        );
      });
    }

    queryClient.invalidateQueries({ queryKey: ["chats"] });

    if (activeView === "chat") {
      setActiveView("queue");
      setSelectedChat(null);
    }
  }, [sessionState.elapsedSeconds, sessionState.estimatedCost, selectedChat, queryClient, activeView, dispatch]);

  const handleSessionStarted = useCallback(({ chatId, psychicRate, clientBalance, startedAt }: { chatId: number; psychicRate?: number; clientBalance?: number; startedAt?: string }) => {
    console.log('[PsychicSessionGlass] Session started:', { chatId, psychicRate, clientBalance, startedAt });
    console.log('[PsychicSessionGlass] currentChat:', currentChat);

    const payload = {
      chat_id: chatId,
      chat_status: 'ACTIVE' as const,
      session_started_at: startedAt || new Date().toISOString(),
      psychic_rate_per_second: psychicRate || 0,
      client_balance: clientBalance || 0,
      psychic_id: currentChat?.psychic_id || 0,
    };

    console.log('[PsychicSessionGlass] Dispatching INITIALIZE with payload:', payload);
    dispatch({
      type: 'INITIALIZE',
      payload
    });
  }, [dispatch, currentChat]);

  const handleConnected = useCallback(async () => {
    console.log('[PsychicSessionGlass] Connected to chat');
    // Load previous messages when connected
    loadPreviousMessages();

    // Fallback: Fetch session state if chat is ACTIVE and session state not initialized
    if (currentChat?.status === 'ACTIVE' && selectedChat && !sessionState.sessionStartedAt) {
      try {
        console.log('[PsychicSessionGlass] Fetching session time as fallback...');
        const sessionData = await getChatSessionTime(selectedChat);
        console.log('[PsychicSessionGlass] Fetched session data:', sessionData);

        dispatch({
          type: 'SYNC_WITH_SERVER',
          payload: {
            elapsed_seconds: sessionData.elapsed_seconds,
            estimated_cost: sessionData.estimated_cost,
            price_per_second: sessionData.price_per_second,
            client_balance: sessionData.client_balance,
          }
        });
      } catch (error) {
        console.error('[PsychicSessionGlass] Failed to fetch session time:', error);
      }
    }
  }, [loadPreviousMessages, selectedChat, currentChat?.status, sessionState.sessionStartedAt, dispatch]);

  const handleDisconnected = useCallback(() => {
    console.log('[PsychicSessionGlass] Disconnected from chat');
  }, []);

  const handleError = useCallback((payload: { error: string | Error }) => {
    console.error('[PsychicSessionGlass] WebSocket error:', payload.error);
    toast.error('Connection error occurred');
  }, [toast]);

  // Subscribe to chat events with stable handlers
  // Handle session timer ticks from WebSocket
  const handleSessionTimerTick = useCallback((payload: { elapsedSeconds: number; estimatedCost: number; effectiveBalance: number; remainingSeconds: number }) => {
    console.log('[PsychicSessionGlass] Session timer tick:', payload);
    console.log('[PsychicSessionGlass] Dispatching SYNC_TIMER with payload:', payload);
    dispatch({ type: 'SYNC_TIMER', payload });
    console.log('[PsychicSessionGlass] SYNC_TIMER dispatched');
  }, [dispatch]);

  useChatEvents({
    facade,
    enabled: activeView === "chat" && !!selectedChat,
    events: {
      [ChatEventType.MESSAGE_RECEIVED]: handleMessageReceived,
      [ChatEventType.SESSION_STARTED]: handleSessionStarted,
      [ChatEventType.SESSION_PAUSED]: handleSessionPaused,
      [ChatEventType.SESSION_RESUMED]: handleSessionResumed,
      [ChatEventType.SESSION_TIMER_TICK]: handleSessionTimerTick,
      [ChatEventType.SESSION_ENDING_SOON]: handleSessionEndingSoon,
      [ChatEventType.SESSION_ENDED]: handleSessionEndedWebSocket,
      [ChatEventType.CONNECTED]: handleConnected,
      [ChatEventType.DISCONNECTED]: handleDisconnected,
      [ChatEventType.ERROR]: handleError,
    },
  });

  // Sync websocket messages with loaded older messages, ensuring no duplicates
  useEffect(() => {
    // Merge WebSocket messages (recent) with loaded older messages
    const combined = [...loadedOlderMessages, ...wsMessages];

    // Remove duplicates based on message ID
    const uniqueMessages = combined.filter((msg, index, self) =>
      index === self.findIndex(m => m.id === msg.id)
    );

    // Sort by timestamp or ID to ensure correct order
    uniqueMessages.sort((a, b) => {
      const timeA = new Date(a.created_at || a.timestamp || 0).getTime();
      const timeB = new Date(b.created_at || b.timestamp || 0).getTime();
      return timeA - timeB;
    });

    setAllMessages(uniqueMessages);
  }, [wsMessages, loadedOlderMessages]);

  // Auto-scroll to bottom when new messages arrive (only for new messages, not when loading more)
  useEffect(() => {
    if (scrollRef.current && !isLoadingMore) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages, isLoadingMore]);

  // Handle click to load more messages
  const handleLoadMoreMessages = async () => {
    if (!scrollRef.current || isLoadingMore || !hasMoreMessages || !selectedChat) {
      console.log("Cannot load more:", {
        hasScrollRef: !!scrollRef.current,
        isLoadingMore,
        hasMoreMessages,
        selectedChat
      });
      return;
    }

    console.log("Loading more messages...");
    setIsLoadingMore(true);

    try {
      const oldestMessageId = allMessages.length > 0 ? allMessages[0].id : undefined;
      console.log("Fetching messages before ID:", oldestMessageId);

      const resp = await getChatMessages(selectedChat, 20, 0, oldestMessageId);
      const olderMessages = resp.messages || [];
      console.log("Received older messages:", olderMessages.length);

      if (olderMessages.length === 0) {
        console.log("No more messages available");
        setHasMoreMessages(false);
        toast.info("No more messages to load");
      } else {
        // If we got fewer messages than requested, we've reached the end
        if (olderMessages.length < 20) {
          setHasMoreMessages(false);
        }

        // Store current scroll height before adding messages
        const prevScrollHeight = scrollRef.current.scrollHeight;
        prevScrollHeightRef.current = prevScrollHeight;

        // Normalize and prepend older messages
        const normalizedMessages = olderMessages.map(msg => ({
          id: msg.id,
          type: msg.is_system ? "system" as const : "message" as const,
          content: msg.content,
          user_id: msg.sender_id,
          sender_id: msg.sender_id,
          timestamp: msg.created_at,
          created_at: msg.created_at,
          chat_id: msg.chat_id,
          is_system: msg.is_system,
        }));

        // Add to loaded older messages (this will trigger the merge in useEffect)
        setLoadedOlderMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMessages = normalizedMessages.filter(m => !existingIds.has(m.id));
          console.log("Adding", newMessages.length, "new older messages");
          return [...newMessages, ...prev];
        });

        // After state update, adjust scroll position in next tick
        setTimeout(() => {
          if (scrollRef.current) {
            const newScrollHeight = scrollRef.current.scrollHeight;
            scrollRef.current.scrollTop = newScrollHeight - prevScrollHeight;
          }
        }, 100);
      }
    } catch (err: any) {
      console.error("Failed to load more messages:", err);
      toast.error(err?.response?.data?.detail || "Failed to load more messages");
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Reset messages and state when chat changes
  useEffect(() => {
    console.log("Chat changed, resetting messages");
    setHasMoreMessages(true);
    setAllMessages([]);
    setLoadedOlderMessages([]);
  }, [selectedChat]);

  // Note: Session time and cost are now managed by useChatSessionState hook

  const handleAcceptChat = async (chatId: number) => {
    setProcessingChats((prev) => new Set(prev).add(chatId));
    try {
      await updateChatStatus(chatId, { status: "ACTIVE" });
      // Invalidate queries to refresh chat list
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
      toast.success("Chat request accepted successfully!");

      // Enter the chat view (same for both psychics and admins)
      setSelectedChat(chatId);
      setActiveView("chat");
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.detail ||
        "Failed to accept chat request. Please try again.";
      toast.error(errorMessage);
      console.error("Failed to accept chat:", err);
    } finally {
      setProcessingChats((prev) => {
        const newSet = new Set(prev);
        newSet.delete(chatId);
        return newSet;
      });
    }
  };

  const handleDenyChat = async (chatId: number) => {
    setProcessingChats((prev) => new Set(prev).add(chatId));
    try {
      await updateChatStatus(chatId, { status: "ENDED" });
      // Invalidate queries to refresh chat list
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
      toast.success("Chat request declined.");
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.detail ||
        "Failed to decline chat request. Please try again.";
      toast.error(errorMessage);
      console.error("Failed to deny chat:", err);
    } finally {
      setProcessingChats((prev) => {
        const newSet = new Set(prev);
        newSet.delete(chatId);
        return newSet;
      });
    }
  };

  const handleEnterChat = (chatId: number) => {
    // Enter the chat view (same for both psychics and admins)
    setSelectedChat(chatId);
    setActiveView("chat");
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !canParticipate) return;

    if (!facade) {
      toast.error("Chat not initialized");
      return;
    }

    try {
      await facade.sendMessage(input);
      setInput("");
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error("Failed to send message");
    }
  };

  const handleEndChat = async () => {
    if (!selectedChat) return;

    setIsTerminating(true);
    try {
      await updateChatStatus(selectedChat, { status: "ENDED" });
      toast.success("Chat session ended successfully");
      setActiveView("queue");
      setSelectedChat(null);
      // Invalidate queries to refresh chat list
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to end chat session");
    } finally {
      setIsTerminating(false);
    }
  };

  const filteredChats =
    (activeTab === "ALL"
      ? chats
      : chats.filter((chat) => chat.status === activeTab)
    ).filter((chat) =>
      (chat.user_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (chat.psychic_name || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

  const formatTime = (totalSeconds: number | null | undefined) => {
    const secs = totalSeconds || 0;
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount / 100);
  };

  const tabs = [
    { key: "ALL", label: "All", count: chats.length },
    {
      key: "REQUESTED",
      label: "Pending",
      count: chats.filter((c) => c.status === "REQUESTED").length,
    },
    {
      key: "ACTIVE",
      label: "Active",
      count: chats.filter((c) => c.status === "ACTIVE").length,
    },
    {
      key: "ENDED",
      label: "Ended",
      count: chats.filter((c) => c.status === "ENDED").length,
    },
  ] as const;

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: COLORS.dark }}
      >
        <Icon
          icon="solar:black-hole-line-duotone"
          className="text-5xl animate-spin"
          style={{ color: COLORS.primary }}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen p-6 md:p-8 relative overflow-hidden"
      style={{
        backgroundColor: COLORS.dark,
        fontFamily: TYPOGRAPHY.fontFamily.body,
      }}
    >
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-10 animate-pulse"
          style={{
            background: `radial-gradient(circle, ${COLORS.primary} 0%, transparent 70%)`,
            animation: "pulse 8s ease-in-out infinite",
          }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{
            background: `radial-gradient(circle, ${COLORS.primary} 0%, transparent 70%)`,
            animation: "pulse 12s ease-in-out infinite reverse",
          }}
        />
      </div>

      <AnimatePresence mode="wait">
        {activeView === "queue" ? (
          <motion.div
            key="queue"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="relative z-10"
          >
            {/* Header with mystical design */}
            <div className="mb-10">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-center gap-4 mb-4"
              >
                <div
                  className="w-1 h-16 rounded-full"
                  style={{
                    background: `linear-gradient(180deg, ${COLORS.primary} 0%, transparent 100%)`,
                  }}
                />
                <div>
                  <h1
                    style={TYPOGRAPHY.headings.h1}
                    className="uppercase italic tracking-tight flex items-center gap-3"
                  >
                    <Icon
                      icon="solar:chat-round-line-bold-duotone"
                      className="text-4xl"
                      style={{ color: COLORS.primary }}
                    />
                    <span className="text-white">Psychic</span>{" "}
                    <span style={{ color: COLORS.primary }}>Sessions</span>
                  </h1>
                  <div className="flex items-center gap-3 mt-2">
                    <div
                      className="flex items-center gap-2 px-3 py-1 rounded-full border"
                      style={{
                        backgroundColor: `${COLORS.primary}10`,
                        borderColor: `${COLORS.primary}30`,
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full animate-pulse"
                        style={{ backgroundColor: COLORS.primary }}
                      />
                      <span
                        style={{ color: COLORS.primary }}
                        className="text-[10px] font-bold uppercase tracking-wider"
                      >
                        Live
                      </span>
                    </div>
                    <p
                      style={{ color: COLORS.neutralGray }}
                      className="text-[10px] font-bold uppercase tracking-[0.3em]"
                    >
                      Manage Your Client Conversations
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Admin Mode Banner */}
            {isAdmin && (
              <div
                className="mb-6 px-6 py-4 rounded-2xl backdrop-blur-xl border flex items-center gap-3"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.starGold}20 0%, ${COLORS.starGold}10 100%)`,
                  borderColor: `${COLORS.starGold}30`,
                  boxShadow: `0 4px 16px ${COLORS.starGold}20`,
                }}
              >
                <Icon icon="mdi:shield-account" width={24} height={24} color={COLORS.starGold} />
                <div className="flex-1">
                  <span className="text-sm font-bold block" style={{ color: COLORS.starGold }}>
                    Admin Mode Active
                  </span>
                  <span className="text-xs" style={{ color: COLORS.neutralGray }}>
                    You can view, accept, reject, and manage all psychic chats
                  </span>
                </div>
              </div>
            )}

            {/* Search Bar */}
            <div className="relative mb-6">
              <Icon icon="solar:magnifer-linear" className="absolute left-4 top-1/2 -translate-y-1/2 text-lg" style={{ color: COLORS.neutralGray }} />
              <input
                type="text"
                placeholder="Search by username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-12 py-3.5 rounded-2xl text-sm outline-none transition-all backdrop-blur-xl border"
                style={{
                  backgroundColor: `${COLORS.surface}DD`,
                  borderColor: `${COLORS.neutralDarkGray}50`,
                  color: COLORS.neutralWhite,
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-lg"
                  style={{ color: COLORS.neutralGray }}
                >
                  <Icon icon="solar:close-circle-bold" />
                </button>
              )}
            </div>

            {/* Tabs with enhanced design */}
            <div
              className="relative mb-8 p-1.5 rounded-2xl backdrop-blur-xl border overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${COLORS.surface}DD 0%, ${COLORS.surfaceAccent}AA 100%)`,
                borderColor: `${COLORS.neutralDarkGray}30`,
                boxShadow: `0 8px 32px ${COLORS.dark}60, inset 0 1px 0 ${COLORS.neutralWhite}10`,
              }}
            >
              {/* Background glow for active tab */}
              <div
                className="absolute inset-0 opacity-50 blur-xl"
                style={{
                  background: `radial-gradient(circle at ${tabs.findIndex((t) => t.key === activeTab) * 25 + 12.5
                    }% 50%, ${COLORS.primary}20 0%, transparent 50%)`,
                  transition: "all 0.3s ease",
                }}
              />

              <div className="relative flex gap-2">
                {tabs.map((tab, index) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className="flex-1 px-6 py-4 rounded-xl transition-all duration-300 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 relative overflow-hidden"
                    style={{
                      backgroundColor:
                        activeTab === tab.key
                          ? COLORS.primary
                          : `${COLORS.neutralWhite}05`,
                      color:
                        activeTab === tab.key ? COLORS.dark : COLORS.neutralGray,
                      boxShadow:
                        activeTab === tab.key
                          ? `0 4px 20px ${COLORS.primary}50, inset 0 1px 0 ${COLORS.neutralWhite}20`
                          : "none",
                    }}
                  >
                    {activeTab === tab.key && (
                      <div
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(135deg, ${COLORS.primary}FF 0%, ${COLORS.primary}DD 100%)`,
                          borderRadius: "12px",
                        }}
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                    {tab.count > 0 && (
                      <span
                        className="relative z-10 min-w-[20px] h-5 px-1.5 rounded-full text-[9px] font-black flex items-center justify-center"
                        style={{
                          backgroundColor:
                            activeTab === tab.key
                              ? `${COLORS.dark}50`
                              : `${COLORS.primary}30`,
                          color:
                            activeTab === tab.key
                              ? COLORS.neutralWhite
                              : COLORS.primary,
                          border: `1px solid ${activeTab === tab.key
                              ? `${COLORS.dark}70`
                              : `${COLORS.primary}50`
                            }`,
                        }}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat List */}
            {filteredChats.length === 0 ? (
              <div
                className="p-20 rounded-3xl backdrop-blur-xl border text-center relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.surface}DD 0%, ${COLORS.surfaceAccent}AA 100%)`,
                  borderColor: `${COLORS.neutralDarkGray}30`,
                  boxShadow: `0 8px 32px ${COLORS.dark}60, inset 0 1px 0 ${COLORS.neutralWhite}10`,
                }}
              >
                <div
                  className="absolute inset-0 opacity-5"
                  style={{
                    backgroundImage: `radial-gradient(circle, ${COLORS.primary} 1px, transparent 1px)`,
                    backgroundSize: "30px 30px",
                  }}
                />
                <Icon
                  icon="solar:chat-line-bold-duotone"
                  className="text-7xl mx-auto mb-6"
                  style={{ color: COLORS.neutralGray, opacity: 0.5 }}
                />
                <p className="text-white/70 text-base font-bold mb-2">
                  No {activeTab.toLowerCase()} sessions
                </p>
                <p
                  className="text-[10px] uppercase tracking-widest font-black"
                  style={{ color: COLORS.neutralGray, opacity: 0.5 }}
                >
                  {searchQuery ? "Try a different search" : "Your queue is clear"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredChats.map((chat) => (
                  <GlassChatListItem
                    key={chat.id}
                    chat={chat}
                    onAccept={() => handleAcceptChat(chat.id)}
                    onDeny={() => handleDenyChat(chat.id)}
                    onEnter={() => handleEnterChat(chat.id)}
                    isProcessing={processingChats.has(chat.id)}
                    isPsychic={user?.role === "PSYCHIC" || isAdmin}
                  />
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex gap-6 relative z-10"
          >
            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col">
              {/* Chat Header with enhanced design */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-6 p-5 rounded-2xl backdrop-blur-xl border relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.surface}EE 0%, ${COLORS.surfaceAccent}BB 100%)`,
                  borderColor: `${COLORS.neutralDarkGray}30`,
                  boxShadow: `0 8px 32px ${COLORS.dark}60, inset 0 1px 0 ${COLORS.neutralWhite}10`,
                }}
              >
                {/* Decorative gradient overlay */}
                <div
                  className="absolute top-0 left-0 right-0 h-1 opacity-70"
                  style={{
                    background: `linear-gradient(90deg, transparent 0%, ${COLORS.primary} 50%, transparent 100%)`,
                  }}
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <motion.button
                      whileHover={{ scale: 1.05, x: -2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setActiveView("queue");
                        setSelectedChat(null);
                      }}
                      className="p-3 rounded-xl border transition-all duration-300 group"
                      style={{
                        backgroundColor: `${COLORS.surfaceAccent}90`,
                        borderColor: `${COLORS.neutralDarkGray}50`,
                        color: COLORS.primary,
                      }}
                    >
                      <Icon
                        icon="solar:alt-arrow-left-bold"
                        className="text-xl group-hover:-translate-x-1 transition-transform"
                      />
                    </motion.button>

                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${COLORS.primary}40 0%, ${COLORS.primary}20 100%)`,
                          border: `2px solid ${COLORS.primary}60`,
                        }}
                      >
                        <Icon
                          icon="solar:user-bold-duotone"
                          className="text-2xl"
                          style={{ color: COLORS.primary }}
                        />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-white">
                          {currentChat?.user_name || "Chat Session"}
                        </h2>
                        <div className="flex items-center gap-2">
                          <p
                            className="text-[9px] font-black uppercase tracking-widest"
                            style={{ color: COLORS.neutralGray }}
                          >
                            Session #{selectedChat}
                          </p>
                          {currentChat?.status === "ACTIVE" && !isPaused && (
                            <div className="flex items-center gap-1.5">
                              <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: "#4ADE80" }}
                              />
                              <span
                                className="text-[9px] font-black uppercase tracking-wider"
                                style={{ color: "#4ADE80" }}
                              >
                                Active
                              </span>
                            </div>
                          )}
                          {isPaused && (
                            <div className="flex items-center gap-1.5">
                              <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: "#FB923C" }}
                              />
                              <span
                                className="text-[9px] font-black uppercase tracking-wider"
                                style={{ color: "#FB923C" }}
                              >
                                Paused
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Connection indicator */}
                  <div
                    className="px-3 py-1.5 rounded-full border flex items-center gap-2"
                    style={{
                      backgroundColor: isConnected
                        ? "rgba(74, 222, 128, 0.1)"
                        : "rgba(248, 113, 113, 0.1)",
                      borderColor: isConnected
                        ? "rgba(74, 222, 128, 0.3)"
                        : "rgba(248, 113, 113, 0.3)",
                    }}
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: isConnected ? "#4ADE80" : "#F87171",
                      }}
                    />
                    <span
                      className="text-[9px] font-black uppercase tracking-wider"
                      style={{ color: isConnected ? "#4ADE80" : "#F87171" }}
                    >
                      {isConnected ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                </div>

                {/* Warning for non-participants */}
                {!canParticipate && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-4 p-3 rounded-xl flex items-center gap-3 border overflow-hidden"
                    style={{
                      backgroundColor: "rgba(251, 191, 36, 0.1)",
                      borderColor: "rgba(251, 191, 36, 0.3)",
                    }}
                  >
                    <Icon
                      icon="solar:shield-warning-bold-duotone"
                      className="text-xl"
                      style={{ color: "#FBBF24" }}
                    />
                    <span className="text-xs font-bold" style={{ color: "#FBBF24" }}>
                      View-only mode: You cannot send messages in this session
                    </span>
                  </motion.div>
                )}
              </motion.div>

              {/* Admin Mode Banner (for chat view) */}
              {isAdmin && currentChat && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="mb-4 px-6 py-4 rounded-2xl backdrop-blur-xl border flex items-center gap-3"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.starGold}20 0%, ${COLORS.starGold}10 100%)`,
                    borderColor: `${COLORS.starGold}30`,
                    boxShadow: `0 4px 16px ${COLORS.starGold}20`,
                  }}
                >
                  <Icon icon="mdi:shield-account" width={20} height={20} color={COLORS.starGold} />
                  <span className="text-sm font-bold" style={{ color: COLORS.starGold }}>
                    Admin Mode: Connected as {currentChat.psychic_name || 'Psychic'}
                  </span>
                </motion.div>
              )}

              {/* Paused Warning Banner (for psychic view) */}
              {isPaused && (
                <div
                  className="mb-4 p-4 rounded-xl border"
                  style={{
                    backgroundColor: "rgba(251, 146, 60, 0.1)",
                    borderColor: "rgba(251, 146, 60, 0.3)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <Icon icon="solar:clock-circle-bold" className="text-orange-400 text-2xl flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-white font-bold text-sm mb-1">
                        ⚠️ Client Balance Insufficient - Chat Paused
                      </h4>
                      <p className="text-white/70 text-xs mb-2">
                        The client needs to top up their balance to continue. This session will automatically end in 30 minutes if not resumed.
                      </p>
                      <div className="text-xs text-white/50 mb-3">
                        <span className="font-semibold">Earnings so far:</span> ${(sessionState.estimatedCost || 0).toFixed(2)}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleEndChat}
                          disabled={isTerminating}
                          className="px-5 py-2 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          style={{
                            backgroundColor: "rgba(248, 113, 113, 0.15)",
                            borderColor: "#F87171",
                            color: "#F87171",
                          }}
                        >
                          <Icon
                            icon={isTerminating ? "eos-icons:loading" : "solar:stop-circle-bold-duotone"}
                            className="text-base"
                          />
                          {isTerminating ? "Ending..." : "End Session"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Messages Container with enhanced design */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                ref={scrollRef}
                className="mb-6 p-6 rounded-2xl backdrop-blur-xl border flex-1 relative"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.surface}CC 0%, ${COLORS.surfaceAccent}99 100%)`,
                  borderColor: `${COLORS.neutralDarkGray}30`,
                  boxShadow: `0 8px 32px ${COLORS.dark}60, inset 0 1px 0 ${COLORS.neutralWhite}05`,
                  height: "calc(100vh - 360px)",
                  minHeight: "500px",
                  maxHeight: "calc(100vh - 360px)",
                  overflowY: "auto",
                  overflowX: "hidden",
                }}
              >
                {/* Subtle dot pattern background */}
                <div
                  className="absolute inset-0 opacity-5 pointer-events-none"
                  style={{
                    backgroundImage: `radial-gradient(circle, ${COLORS.primary} 0.5px, transparent 0.5px)`,
                    backgroundSize: "20px 20px",
                  }}
                />

                <div className="relative z-10">
                  {/* Load more indicator */}
                  {isLoadingMore && (
                    <div className="flex justify-center py-4">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Icon
                          icon="solar:black-hole-line-duotone"
                          className="text-2xl"
                          style={{ color: COLORS.primary }}
                        />
                      </motion.div>
                    </div>
                  )}

                  {/* Show "click for more messages" button */}
                  {!isLoadingMore && hasMoreMessages && allMessages.length > 0 && (
                    <div className="flex justify-center py-3">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleLoadMoreMessages}
                        className="px-6 py-3 rounded-full border cursor-pointer transition-all duration-300"
                        style={{
                          backgroundColor: `${COLORS.primary}20`,
                          borderColor: `${COLORS.primary}50`,
                        }}
                      >
                        <p
                          className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
                          style={{ color: COLORS.primary }}
                        >
                          <Icon icon="solar:arrow-up-bold" className="text-sm" />
                          Load More Messages
                        </p>
                      </motion.button>
                    </div>
                  )}

                  {loadingMessages ? (
                    <div className="flex flex-col items-center justify-center h-full">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      >
                        <Icon
                          icon="solar:black-hole-line-duotone"
                          className="text-5xl mb-4"
                          style={{ color: COLORS.primary }}
                        />
                      </motion.div>
                      <p className="text-white/60 text-sm">Loading messages...</p>
                    </div>
                  ) : allMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full">
                      <motion.div
                        animate={{ y: [0, -10, 0] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <Icon
                          icon="solar:chat-round-line-bold-duotone"
                          className="text-6xl mb-6"
                          style={{ color: COLORS.neutralGray, opacity: 0.5 }}
                        />
                      </motion.div>
                      <p className="text-white/70 text-base font-bold mb-2">
                        No messages yet
                      </p>
                      <p
                        className="text-[10px] uppercase tracking-widest font-black"
                        style={{ color: COLORS.neutralGray, opacity: 0.5 }}
                      >
                        Begin the spiritual conversation
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {allMessages.map((msg, index) => {
                        // For admins acting as psychic, messages from the psychic are "own"
                        // For regular psychics, messages matching their user_id are "own"
                        const isOwn = isAdmin
                          ? msg.sender_id === currentChat?.psychic_id
                          : msg.sender_id === user?.id;

                        // Create a truly unique key using multiple properties
                        const uniqueKey = msg.id
                          ? `msg-${msg.id}-${msg.created_at || msg.timestamp || index}`
                          : `msg-temp-${index}-${Date.now()}`;

                        if (index === allMessages.length - 1) {
                          console.log("Rendering message:", {
                            content: msg.content?.substring(0, 30),
                            sender_id: msg.sender_id,
                            user_id: user?.id,
                            psychic_id: currentChat?.psychic_id,
                            isAdmin,
                            isOwn,
                            key: uniqueKey
                          });
                        }
                        // Render system messages centered, regular messages as bubbles
                        if (msg.type === 'system' || msg.is_system) {
                          return (
                            <div
                              key={uniqueKey}
                              className="flex justify-center my-4"
                            >
                              <div className="px-5 py-2.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl">
                                <p className="text-xs text-white/50 font-medium text-center">
                                  {msg.content}
                                </p>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <motion.div
                            key={uniqueKey}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(index * 0.03, 0.5) }}
                          >
                            <GlassMessageBubble
                              message={msg}
                              isOwn={isOwn}
                            />
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Input with enhanced design */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <GlassChatInput
                  value={input}
                  onChange={setInput}
                  onSend={handleSendMessage}
                  disabled={
                    !canParticipate ||
                    currentChat?.status !== "ACTIVE"
                  }
                  placeholder={
                    !canParticipate
                      ? "You cannot send messages in this chat"
                      : currentChat?.status !== "ACTIVE"
                        ? "Chat is not active"
                        : "Type your message..."
                  }
                />
              </motion.div>
            </div>

            {/* Sidebar with enhanced entry animation */}
            {currentChat && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <GlassChatSidebar
                  chat={currentChat}
                  seconds={sessionState.elapsedSeconds}
                  estimatedCost={sessionState.estimatedCost}
                  remainingSeconds={sessionState.remainingSeconds}
                  clientBalance={sessionState.clientBalance}
                  showCriticalWarning={sessionState.showCriticalWarning}
                  showLowBalanceWarning={sessionState.showLowBalanceWarning}
                  onEndChat={handleEndChat}
                  isEnding={isTerminating}
                />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session Summary Modal */}
      <SessionSummaryModal
        isOpen={showSessionSummaryModal}
        onClose={() => setShowSessionSummaryModal(false)}
        sessionData={sessionSummaryData}
      />
    </div>
  );
};

export default PsychicSessionGlass;

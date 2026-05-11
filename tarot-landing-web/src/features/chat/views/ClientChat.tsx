import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { useChats } from "../hooks/useChats";
import { useRequestChat, useUpdateChatStatus } from "../hooks/useChatMutations";
import { usePsychicDetails } from "../hooks/usePsychicDetails";
import { getChatMessages, getChatSessionTime, resumeChat, Chat } from "../api/chatApi";
import { useChatEventToasts } from "../hooks/useChatEventToasts";
import { useToast } from "../../../components/Toast/useToast";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useChatSessionState } from "../hooks/useChatSessionState";
import { usePayment } from "@/features/payment/hooks/usePayment";
import { SessionSummaryModal } from "../components/SessionSummaryModal";
import { useChatFacade } from "../hooks/useChatFacade";
import { useChatEvents } from "../hooks/useChatEvents";
import { ChatEventType, ChatMessage } from "../core/ChatEventTypes";
import "../../../styles/starfield.css";

const ClientChat = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { chats, loading, error, refetch } = useChats();
  const toast = useToast();
  const { user } = useAuth();

  // Refs for stable access in callbacks
  const toastRef = useRef(toast);
  const queryClientRef = useRef(queryClient);

  useEffect(() => {
    toastRef.current = toast;
    queryClientRef.current = queryClient;
  }, [toast, queryClient]);

  // Local state
  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [olderMessages, setOlderMessages] = useState<any[]>([]);
  const [showSessionSummaryModal, setShowSessionSummaryModal] = useState(false);
  const [sessionSummaryData, setSessionSummaryData] = useState({
    duration: 0,
    cost: 0,
    endReason: "",
  });

  // Pagination
  const CHATS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(chats.length / CHATS_PER_PAGE));
  const paginatedChats = chats.slice(
    (currentPage - 1) * CHATS_PER_PAGE,
    currentPage * CHATS_PER_PAGE
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [chats.length, totalPages, currentPage]);

  // Get selected chat data
  const selectedChatData = chats.find(c => c.id === selectedChat);

  // React Query hooks
  const requestChatMutation = useRequestChat();
  const updateChatStatusMutation = useUpdateChatStatus();
  const updateChatStatusMutationRef = useRef(updateChatStatusMutation);

  useEffect(() => {
    updateChatStatusMutationRef.current = updateChatStatusMutation;
  }, [updateChatStatusMutation]);

  const { topupChat } = usePayment();

  // Fetch psychic details for selected chat
  const {
    data: psychicDetails,
    isLoading: loadingPsychic
  } = usePsychicDetails(selectedChatData?.psychic_id);

  // Chat session state management with WebSocket
  const {
    sessionState,
    dispatch,
    isActive: isChatActive,
    isPaused,
    isEnded
  } = useChatSessionState({
    chatId: selectedChat,
    currentChatStatus: selectedChatData?.status,
    userRole: 'CLIENT',
    onBalanceWarning: () => {
      console.log('[ClientChat] Low balance warning');
    },
    onSessionAccepted: () => {
      console.log('[ClientChat] Chat accepted - your session has started');

      if (selectedChat) {
        queryClient.setQueryData<Chat[]>(["chats"], (oldChats) => {
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
        queryClient.setQueryData<Chat[]>(["chats"], (oldChats) => {
          if (!oldChats) return oldChats;
          return oldChats.map(chat =>
            chat.id === selectedChat
              ? { ...chat, status: 'PAUSED' as const }
              : chat
          );
        });
      }

      // Force immediate refetch
      refetch();
    },
    onSessionEnded: () => {
      console.log('[ClientChat] onSessionEnded called, refetching chats...');

      if (selectedChat) {
        console.log('[ClientChat] Optimistically updating chat', selectedChat, 'to ENDED');
        queryClient.setQueryData<Chat[]>(["chats"], (oldChats) => {
          if (!oldChats) return oldChats;
          const updated = oldChats.map(chat =>
            chat.id === selectedChat
              ? { ...chat, status: 'ENDED' as const }
              : chat
          );
          console.log('[ClientChat] Updated chats:', updated.find(c => c.id === selectedChat));
          return updated;
        });

        // Force invalidate queries to clear any stale cache
        console.log('[ClientChat] Invalidating chat queries...');
        queryClient.invalidateQueries({ queryKey: ["chats"] });
      }

      // Force immediate refetch to ensure consistency with backend
      console.log('[ClientChat] Calling refetch()...');
      refetch();
    },
  });

  // Use real-time status from sessionState if available, otherwise fall back to API data
  const currentChatStatus = selectedChat && sessionState.chatId === selectedChat && sessionState.status
    ? sessionState.status
    : selectedChatData?.status;

  // DEBUG: Log session state and derived values on every render
  console.log('[ClientChat RENDER] ===================');
  console.log('[ClientChat RENDER] selectedChat:', selectedChat);
  console.log('[ClientChat RENDER] sessionState:', {
    chatId: sessionState.chatId,
    status: sessionState.status,
    elapsedSeconds: sessionState.elapsedSeconds,
    estimatedCost: sessionState.estimatedCost,
    clientBalance: sessionState.clientBalance,
    remainingSeconds: sessionState.remainingSeconds,
    psychicRatePerSecond: sessionState.psychicRatePerSecond,
    sessionStartedAt: sessionState.sessionStartedAt,
  });
  console.log('[ClientChat RENDER] isChatActive:', isChatActive);
  console.log('[ClientChat RENDER] currentChatStatus:', currentChatStatus);
  console.log('[ClientChat RENDER] selectedChatData?.status:', selectedChatData?.status);
  console.log('[ClientChat RENDER] Sidebar condition met?:', (isChatActive || currentChatStatus === 'ACTIVE'));
  console.log('[ClientChat RENDER] ===================');

  const scrollRef = useRef<HTMLDivElement>(null);

  // State for messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // ChatFacade for WebSocket connection
  const { facade, isConnected, error: wsError } = useChatFacade({
    role: 'client',
    chatId: selectedChat,
    autoConnect: true,
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
        type: msg.is_system ? "system" as const : "message" as const,
        content: msg.content,
        user_id: msg.sender_id,
        sender_id: msg.sender_id,
        timestamp: msg.created_at,
        created_at: msg.created_at,
        chat_id: msg.chat_id,
        is_system: msg.is_system,
      }));

      setMessages(normalizedMessages);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, [selectedChat]);

  // Stable event handlers using useCallback
  const handleMessageReceived = useCallback(({ message }: { message: ChatMessage }) => {
    console.log('[ClientChat] Message received handler called:', message);
    setMessages(prev => {
      // Avoid duplicates
      if (prev.some(m => m.id === message.id)) {
        console.log('[ClientChat] Duplicate message, skipping:', message.id);
        return prev;
      }
      console.log('[ClientChat] Adding new message to state:', message.id);
      return [...prev, message];
    });
  }, []);

  const handleSessionEndingSoon = useCallback(({ remainingSeconds }: { remainingSeconds: number }) => {
    console.log(`[ClientChat] Session ending in ${remainingSeconds} seconds`);
  }, []);

  const handleBalanceWarning = useCallback(({ remainingSeconds }: { remainingSeconds: number }) => {
    console.log(`[ClientChat] Low balance warning: ${remainingSeconds}s remaining`);
  }, []);

  const handleBalanceInsufficient = useCallback(() => {
    console.log("[ClientChat] Session ended - insufficient balance for 10 seconds");

    // Update session summary with final data
    setSessionSummaryData({
      duration: sessionState.elapsedSeconds,
      cost: sessionState.estimatedCost,
      endReason: "Session ended - insufficient balance (less than 10 seconds remaining)",
    });

    // Show summary modal
    setShowSessionSummaryModal(true);

    // Optimistically update the chat status in cache
    if (selectedChat) {
      queryClientRef.current.setQueryData<Chat[]>(["chats"], (oldChats) => {
        if (!oldChats) return oldChats;
        return oldChats.map(chat =>
          chat.id === selectedChat
            ? { ...chat, status: 'ENDED' as const }
            : chat
        );
      });
    }

    // Force immediate refetch to ensure consistency with backend
    refetch();

  }, [sessionState.elapsedSeconds, sessionState.estimatedCost, selectedChat, refetch]);

  const handleSessionEndedWebSocket = useCallback(({ reason }: { reason?: string }) => {
    console.log("[ClientChat] SESSION_ENDED WebSocket event received, reason:", reason);

    // Dispatch CHAT_ENDED action to update session state
    dispatch({
      type: 'CHAT_ENDED',
      payload: {
        elapsed_seconds: sessionState.elapsedSeconds,
        estimated_cost: sessionState.estimatedCost,
        reason: reason || 'Session ended',
      }
    });

    // If session was never active (declined request), skip the modal
    const wasDeclined = sessionState.elapsedSeconds === 0 && sessionState.estimatedCost === 0;

    if (!wasDeclined) {
      // Update session summary with final data
      setSessionSummaryData({
        duration: sessionState.elapsedSeconds,
        cost: sessionState.estimatedCost,
        endReason: reason === 'insufficient_balance'
          ? "Session ended - insufficient balance"
          : reason || "Session ended",
      });

      // Show summary modal
      setShowSessionSummaryModal(true);
    }

    // Optimistically update the chat status in cache
    if (selectedChat) {
      queryClientRef.current.setQueryData<Chat[]>(["chats"], (oldChats) => {
        if (!oldChats) return oldChats;
        return oldChats.map(chat =>
          chat.id === selectedChat
            ? { ...chat, status: 'ENDED' as const }
            : chat
        );
      });
    }

    // Force immediate refetch to ensure consistency with backend
    refetch();

    if (wasDeclined) {
      toastRef.current.info("Your chat request was declined.");
    }
  }, [sessionState.elapsedSeconds, sessionState.estimatedCost, selectedChat, refetch, dispatch]);

  const handleSessionInfo = useCallback(({ chat_id, elapsed_seconds, estimated_cost, remaining_seconds, client_balance, chat_status, started_at, rate_per_second }: { chat_id: number; elapsed_seconds: number; estimated_cost: number; remaining_seconds: number; client_balance: number; chat_status: string; started_at: string; rate_per_second: number }) => {
    console.log('[ClientChat] Session info received:', { chat_id, elapsed_seconds, remaining_seconds, client_balance, rate_per_second });

    // Initialize timer with data from backend
    const payload = {
      chat_id,
      chat_status: chat_status as 'ACTIVE' | 'PAUSED' | 'ENDED',
      session_started_at: started_at,
      psychic_rate_per_second: rate_per_second,
      client_balance,
      psychic_id: selectedChatData?.psychic_id || 0,
      elapsed_seconds,
      estimated_cost,
    };

    console.log('[ClientChat] Dispatching INITIALIZE with session info:', payload);
    dispatch({
      type: 'INITIALIZE',
      payload
    });
  }, [dispatch, selectedChatData]);

  const handleSessionStarted = useCallback(({ chatId, psychicRate, clientBalance, startedAt }: { chatId: number; psychicRate?: number; clientBalance?: number; startedAt?: string }) => {
    console.log('[ClientChat] Session started:', { chatId, psychicRate, clientBalance, startedAt });
    console.log('[ClientChat] selectedChatData:', selectedChatData);

    const payload = {
      chat_id: chatId,
      chat_status: 'ACTIVE' as const,
      session_started_at: startedAt || new Date().toISOString(),
      psychic_rate_per_second: psychicRate || 0,
      client_balance: clientBalance || 0,
      psychic_id: selectedChatData?.psychic_id || 0,
    };

    console.log('[ClientChat] Dispatching INITIALIZE with payload:', payload);
    dispatch({
      type: 'INITIALIZE',
      payload
    });
  }, [dispatch, selectedChatData]);

  const handleConnected = useCallback(async () => {
    console.log('[ClientChat] Connected to chat');
    // Load previous messages when connected
    loadPreviousMessages();
    // Session data is now loaded via REST API in useChatSessionState hook
  }, [loadPreviousMessages]);

  const handleDisconnected = useCallback(() => {
    console.log('[ClientChat] Disconnected from chat');
  }, []);

  const handleError = useCallback(({ error }: { error: Error }) => {
    console.error('[ClientChat] Chat error:', error);
  }, []);

  const handleSessionPaused = useCallback(({ reason, elapsed_seconds }: { reason?: string; elapsed_seconds?: number }) => {
    console.log('[ClientChat] Session paused:', { reason, elapsed_seconds });

    // Dispatch CHAT_PAUSED action to update session state
    dispatch({
      type: 'CHAT_PAUSED',
      payload: {
        reason: reason || 'Session paused for top-up',
        elapsed_seconds: elapsed_seconds || sessionState.elapsedSeconds,
        estimated_cost: sessionState.estimatedCost,
      }
    });

    // Optimistically update the chat status in cache
    if (selectedChat) {
      queryClientRef.current.setQueryData<Chat[]>(["chats"], (oldChats) => {
        if (!oldChats) return oldChats;
        return oldChats.map(chat =>
          chat.id === selectedChat
            ? { ...chat, status: 'PAUSED' as const }
            : chat
        );
      });
    }

  }, [selectedChat, sessionState.elapsedSeconds, sessionState.estimatedCost, dispatch]);

  const handleSessionResumed = useCallback(({ elapsed_seconds, remaining_seconds, client_balance, rate_per_second }: { elapsed_seconds?: number; remaining_seconds?: number; client_balance?: number; rate_per_second?: number }) => {
    console.log('[ClientChat] Session resumed:', { elapsed_seconds, remaining_seconds, client_balance, rate_per_second });

    // Dispatch CHAT_RESUMED action to reinitialize timer
    dispatch({
      type: 'CHAT_RESUMED',
      payload: {
        client_balance: client_balance || sessionState.clientBalance || 0,
        elapsed_seconds: elapsed_seconds || sessionState.elapsedSeconds,
        remaining_seconds: remaining_seconds,
        rate_per_second: rate_per_second || sessionState.psychicRatePerSecond,
      }
    });

    // Optimistically update the chat status in cache
    if (selectedChat) {
      queryClientRef.current.setQueryData<Chat[]>(["chats"], (oldChats) => {
        if (!oldChats) return oldChats;
        return oldChats.map(chat =>
          chat.id === selectedChat
            ? { ...chat, status: 'ACTIVE' as const }
            : chat
        );
      });
    }

    // Show toast notification
    toastRef.current.success('Session resumed! Your session continues.');
  }, [selectedChat, sessionState.elapsedSeconds, sessionState.clientBalance, sessionState.psychicRatePerSecond, dispatch]);

  // Subscribe to chat events with stable handlers
  // Removed SESSION_TIMER_TICK, BALANCE_WARNING, BALANCE_CRITICAL - using client-side timer
  useChatEventToasts(selectedChat, 'CLIENT');

  useChatEvents({
    facade,
    enabled: !!selectedChat,
    events: {
      [ChatEventType.MESSAGE_RECEIVED]: handleMessageReceived,
      [ChatEventType.SESSION_INFO]: handleSessionInfo,
      [ChatEventType.SESSION_STARTED]: handleSessionStarted,
      [ChatEventType.SESSION_ENDING_SOON]: handleSessionEndingSoon,
      [ChatEventType.SESSION_ENDED]: handleSessionEndedWebSocket,
      [ChatEventType.BALANCE_INSUFFICIENT]: handleBalanceInsufficient,
      [ChatEventType.SESSION_PAUSED]: handleSessionPaused,
      [ChatEventType.SESSION_RESUMED]: handleSessionResumed,
      [ChatEventType.CONNECTED]: handleConnected,
      [ChatEventType.DISCONNECTED]: handleDisconnected,
      [ChatEventType.ERROR]: handleError,
    },
  });

  // Clear messages when chat changes
  useEffect(() => {
    console.log('[ClientChat] selectedChat changed to:', selectedChat);
    setMessages([]);
  }, [selectedChat]);

  // Track when sidebar should show
  useEffect(() => {
    const shouldShow = isChatActive || currentChatStatus === 'ACTIVE';
    console.log('[ClientChat] Sidebar visibility check:', {
      isChatActive,
      currentChatStatus,
      shouldShow,
      sessionStateStatus: sessionState.status,
      sessionStateChatId: sessionState.chatId,
      selectedChat,
    });
  }, [isChatActive, currentChatStatus, sessionState.status, sessionState.chatId, selectedChat]);

  // Track if we've already handled the session end to prevent infinite loop
  const hasHandledSessionEnd = useRef(false);

  // Reset the flag when chat changes
  useEffect(() => {
    hasHandledSessionEnd.current = false;
  }, [selectedChat]);

  // Auto-disconnect WebSocket and show modal when timer reaches 0
  useEffect(() => {
    if (sessionState.status === 'ENDED' && sessionState.remainingSeconds === 0 && !hasHandledSessionEnd.current) {
      // Skip if session was never active (e.g., declined request)
      if (sessionState.elapsedSeconds === 0 && sessionState.estimatedCost === 0) {
        hasHandledSessionEnd.current = true;
        return;
      }

      console.log('[ClientChat] Timer reached 0 - auto-ending session');
      hasHandledSessionEnd.current = true; // Mark as handled immediately

      // Disconnect WebSocket
      if (facade && isConnected) {
        console.log('[ClientChat] Disconnecting WebSocket due to insufficient balance');
        facade.disconnect();
      }

      // Show session summary modal
      setSessionSummaryData({
        duration: sessionState.elapsedSeconds,
        cost: sessionState.estimatedCost,
        endReason: "Session ended - insufficient balance",
      });
      setShowSessionSummaryModal(true);

      // Update chat status in cache
      if (selectedChat) {
        queryClientRef.current.setQueryData<Chat[]>(["chats"], (oldChats) => {
          if (!oldChats) return oldChats;
          return oldChats.map(chat =>
            chat.id === selectedChat
              ? { ...chat, status: 'ENDED' as const }
              : chat
          );
        });
      }

      // Refetch to sync with backend
      refetch();
    }
  }, [sessionState.status, sessionState.remainingSeconds, sessionState.elapsedSeconds, sessionState.estimatedCost, facade, isConnected, selectedChat, refetch]);

  const handleEnterChat = (chatId: number) => {
    setSelectedChat(chatId);
    setOlderMessages([]);
    setHasMoreMessages(true);
    // Psychic details will be fetched automatically by usePsychicDetails hook
  };

  const handleBackToList = () => {
    setSelectedChat(null);
  };

  const handleRequestNewChat = async () => {
    if (!selectedChatData || !requestMessage.trim()) {
      toast.error("Please enter a message");
      return;
    }

    requestChatMutation.mutate(
      {
        psychic_id: selectedChatData.psychic_id,
        message: requestMessage
      },
      {
        onSuccess: () => {
          toast.success("Chat request sent successfully!");
          setShowRequestModal(false);
          setRequestMessage("");
          setRequestError(null);
        },
        onError: (err: any) => {
          const errorMessage = err?.response?.data?.detail ?? err?.response?.data?.message ?? "Failed to send chat request. Please try again.";
          setRequestError(errorMessage);
        }
      }
    );
  };

  // Handle canceling a pending chat request
  const handleCancelRequest = async () => {
    if (!selectedChat) return;

    updateChatStatusMutation.mutate(
      { chatId: selectedChat, status: { status: "ARCHIVED" } },
      {
        onSuccess: () => {
          toast.success("Chat request cancelled");
          setSelectedChat(null);
        },
        onError: (err: any) => {
          const errorMessage = err?.response?.data?.detail || "Failed to cancel chat request. Please try again.";
          toast.error(errorMessage);
        }
      }
    );
  };

  // Handle ending an active chat
  const handleEndChat = async () => {
    if (!selectedChat) return;

    updateChatStatusMutation.mutate(
      { chatId: selectedChat, status: { status: "ENDED" } },
      {
        onSuccess: () => {
          setShowEndConfirm(false);
        },
        onError: (err: any) => {
          const errorMessage = err?.response?.data?.detail || "Failed to end chat. Please try again.";
          toast.error(errorMessage);
        }
      }
    );
  };

  // Load older messages
  const handleLoadOlderMessages = async () => {
    if (!selectedChat || loadingOlderMessages || !hasMoreMessages) return;

    setLoadingOlderMessages(true);
    try {
      // Combine current messages to find the oldest one
      const allCurrentMessages = [...olderMessages, ...messages];

      // Get oldest message ID (the minimum ID we currently have)
      const messagesWithIds = allCurrentMessages.filter(m => m.id);
      const oldestMessageId = messagesWithIds.length > 0
        ? Math.min(...messagesWithIds.map(m => m.id!))
        : undefined;

      // Fetch older messages (limit 50, before the oldest message we have)
      const response = await getChatMessages(selectedChat, 50, 0, oldestMessageId);
      const fetchedMessages = response.messages || [];

      // If we get no messages, there are no more
      if (fetchedMessages.length === 0) {
        setHasMoreMessages(false);
        toast.info("No more messages to load");
        return;
      }

      // Normalize message format
      const normalizedMessages = fetchedMessages.map(msg => ({
        id: msg.id,
        type: "message" as const,
        content: msg.content,
        user_id: msg.sender_id,
        sender_id: msg.sender_id,
        timestamp: msg.created_at || msg.timestamp,
        created_at: msg.created_at,
        chat_id: msg.chat_id,
      }));

      // Filter out messages that are already loaded (use ID as unique identifier)
      const existingMessageIds = new Set(messagesWithIds.map(m => m.id));
      const newMessages = normalizedMessages.filter(msg => msg.id && !existingMessageIds.has(msg.id));

      // If no new messages after filtering, we've reached the end
      if (newMessages.length === 0) {
        setHasMoreMessages(false);
        toast.info("No more messages to load");
        return;
      }

      // Add only new messages to older messages (prepend to start)
      setOlderMessages(prev => [...newMessages, ...prev]);

      toast.success(`Loaded ${newMessages.length} older message${newMessages.length !== 1 ? 's' : ''}`);
    } catch (err) {
      console.error("Failed to load older messages:", err);
      toast.error("Failed to load older messages");
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  // Note: Session state management (timer, notifications) now handled by useChatSessionState hook

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const formatTime = (s: number | null | undefined) => {
    const seconds = s || 0;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (!isConnected) {
      toast.error("Not connected to chat. Please wait or try rejoining.");
      return;
    }

    if (!facade) {
      toast.error("Chat not initialized");
      return;
    }

    try {
      await facade.sendMessage(input);
      setInput("");
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error("Failed to send message. Please try again.");
    }
  };

  const handlePauseForTopUp = async () => {
    if (!selectedChat) return;

    try {
      // Call topup endpoint which will pause via SessionManager and return Stripe URL
      toast.info('Pausing session and preparing payment...');
      await topupChat(selectedChat);
      // topupChat will redirect to Stripe automatically
    } catch (error: any) {
      toast.error(error?.message || 'Failed to initiate top-up');
    }
  };

  const handleTopUpClick = async () => {
    if (!selectedChat) return;

    try {
      toast.info('Preparing payment...');

      await topupChat(selectedChat);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to initiate top-up');
    }
  };

  const handleResumeChat = async () => {
    if (!selectedChat) return;

    try {
      toast.info('Resuming session...');
      const data = await resumeChat(selectedChat);

      dispatch({
        type: 'CHAT_RESUMED',
        payload: {
          client_balance: data.client_balance,
          elapsed_seconds: data.elapsed_seconds,
          remaining_seconds: data.remaining_seconds,
          rate_per_second: data.rate_per_second,
        }
      });

      refetch();
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || 'Failed to resume session';
      toast.error(msg);
    }
  };

  // Handle return from payment
  useEffect(() => {
    const chatIdParam = searchParams.get('chat_id');
    const status = searchParams.get('status');

    if (!chatIdParam) return;

    const chatIdNum = parseInt(chatIdParam);

    // Payment successful - webhook will handle resume via SessionManager
    if (status === 'success') {
      setSelectedChat(chatIdNum);
      toastRef.current.success('Payment successful! Session will resume automatically.')

      // Clean up URL after short delay
      const timer = setTimeout(() => {
        navigate('/chats', { replace: true });
      }, 2000);

      return () => clearTimeout(timer);
    }

    // Payment cancelled - keep chat paused so user can retry or use existing balance
    if (status === 'cancelled') {
      setSelectedChat(chatIdNum);

      const timer = setTimeout(async () => {
        toast.info('Top-up cancelled. Your chat is paused — you can top up again or resume if you have balance.');

        // Clean up URL
        navigate(`/chats?chat_id=${chatIdNum}`, { replace: true });
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [searchParams, navigate]);

  // Show WebSocket errors
  useEffect(() => {
    if (wsError) {
      console.error("WebSocket Error:", wsError);
      toast.error(wsError);
    }
  }, [wsError, toast]);

  // Don't auto-select chat - let user choose
  // This prevents unnecessary WebSocket connections and API calls on page load

  // Combine older messages with current messages
  const allMessages = useMemo(() => {
    return [...olderMessages, ...messages];
  }, [olderMessages, messages]);

  // --- LOADING STATE ---
  if (loading) {
    return (
      <div className="h-[calc(100dvh-80px)] flex items-center justify-center relative overflow-hidden" style={{ fontFamily: TYPOGRAPHY.fontFamily.body, backgroundColor: COLORS.dark }}>
        <div className="text-center relative z-10">
          <div className="w-20 h-20 rounded-3xl border-4 border-white/10 border-t-primary mx-auto mb-6 animate-spin" />
          <p className="text-base text-white/60 font-semibold">Loading your messages...</p>
        </div>
      </div>
    );
  }

  // --- ERROR STATE ---
  if (error) {
    return (
      <div className="h-[calc(100dvh-80px)] flex items-center justify-center relative overflow-hidden" style={{ fontFamily: TYPOGRAPHY.fontFamily.body, backgroundColor: COLORS.dark }}>
        <div className="text-center max-w-md px-6 relative z-10">
          <div className="w-20 h-20 rounded-3xl bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mx-auto mb-6">
            <Icon icon="solar:danger-triangle-bold-duotone" className="text-4xl text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
            Unable to Load Chats
          </h2>
          <p className="text-base text-white/60 mb-8">{error}</p>
          <button
            onClick={refetch}
            className="px-8 py-4 rounded-2xl font-bold text-sm transition-opacity hover:opacity-90 shadow-lg text-white"
            style={{
              background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // --- MESSENGER-STYLE 2-COLUMN LAYOUT ---
  return (
    <div
      className="h-[calc(100dvh-80px)] flex gap-2 md:gap-4 p-2 sm:p-3 md:p-4 relative overflow-hidden"
      style={{ fontFamily: TYPOGRAPHY.fontFamily.body, backgroundColor: COLORS.dark }}
    >
      {/* Starfield Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="starfield"></div>
        <div className="starfield-dense"></div>
      </div>

      {/* LEFT SIDEBAR - CHAT LIST */}
      <div className={`${selectedChat ? 'hidden' : 'flex'} md:flex w-full md:w-80 lg:w-96 flex-col relative z-10 backdrop-blur-xl rounded-3xl border border-white/10`} style={{ backgroundColor: `${COLORS.surface}22` }}>
        {/* Header */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-1" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                Messages
              </h1>
              <p className="text-sm text-white/40">Connect with your psychics</p>
            </div>
            <button
              onClick={refetch}
              className="w-11 h-11 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/10"
              title="Refresh"
            >
              <Icon icon="solar:refresh-linear" className="text-white/60 text-xl" />
            </button>
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto min-h-0 px-3 py-4 space-y-2">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-6 border border-white/10">
                <Icon icon="solar:chat-dots-bold-duotone" className="text-5xl text-primary" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                No messages yet
              </h3>
              <p className="text-sm text-white/50 mb-6 max-w-[240px]">
                Start a conversation with a psychic and unlock your destiny
              </p>
              <button
                onClick={() => window.location.href = '/psychics-browse'}
                className="px-8 py-3 rounded-full font-semibold text-sm transition-opacity hover:opacity-90 shadow-lg text-white"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`
                }}
              >
                Browse Psychics
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {paginatedChats.map((chat, index) => {
                // Use real-time status for selected chat if available
                const displayStatus = chat.id === selectedChat && sessionState.chatId === selectedChat && sessionState.status
                  ? sessionState.status
                  : chat.status;

                return (
                  <div
                    key={chat.id}
                    onClick={() => handleEnterChat(chat.id)}
                    className={`flex items-center gap-3 p-4 cursor-pointer transition-all rounded-2xl border ${selectedChat === chat.id
                      ? 'bg-white/10 border-primary/30 shadow-lg shadow-primary/10'
                      : 'bg-white/5 border-white/5 hover:bg-white/8 hover:border-white/10'
                      }`}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center overflow-hidden border border-white/10">
                        {chat.user_profile_pic_url ? (
                          <img
                            src={chat.user_profile_pic_url}
                            alt={chat.user_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Icon icon="ph:user-fill" className="text-white/80 text-3xl" />
                        )}
                      </div>
                      {displayStatus === 'ACTIVE' && (
                        <div
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 flex items-center justify-center"
                          style={{ borderColor: selectedChat === chat.id ? 'rgba(255,255,255,0.1)' : COLORS.surface }}
                        >
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                      )}
                      {displayStatus === 'PAUSED' && (
                        <div
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-orange-500 border-2 flex items-center justify-center"
                          style={{ borderColor: selectedChat === chat.id ? 'rgba(255,255,255,0.1)' : COLORS.surface }}
                        >
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="font-bold text-white text-base truncate" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                          {chat.user_name}
                        </span>
                        {displayStatus === 'ACTIVE' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 flex-shrink-0">
                            Active
                          </span>
                        )}
                        {displayStatus === 'PAUSED' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 flex-shrink-0">
                            Paused
                          </span>
                        )}
                        {displayStatus === 'ENDED' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 flex-shrink-0">
                            Ended
                          </span>
                        )}
                        {displayStatus === 'REQUESTED' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 flex-shrink-0">
                            Pending
                          </span>
                        )}
                        {displayStatus === 'ARCHIVED' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-400 flex-shrink-0">
                            Cancelled
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-white/60 truncate">
                        {chat.last_message}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {chats.length > CHATS_PER_PAGE && (
            <div className="flex items-center justify-center gap-2 pt-2 pb-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center border border-white/10 transition-all"
              >
                <Icon icon="solar:alt-arrow-left-linear" className="text-white/70 text-lg" />
              </button>
              {(() => {
                const pages: (number | string)[] = [];
                const maxVisible = 5;
                if (totalPages <= maxVisible) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                  pages.push(1);
                  if (currentPage > 3) pages.push('...');
                  for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
                  if (currentPage < totalPages - 2) pages.push('...');
                  pages.push(totalPages);
                }
                return pages.map((p, i) =>
                  typeof p === 'string' ? (
                    <span key={`e${i}`} className="text-white/30 text-xs px-1">···</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`min-w-[36px] h-9 rounded-xl text-sm font-semibold transition-all border ${
                        currentPage === p
                          ? 'bg-primary/20 border-primary/40 text-primary'
                          : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {p}
                    </button>
                  )
                );
              })()}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center border border-white/10 transition-all"
              >
                <Icon icon="solar:alt-arrow-right-linear" className="text-white/70 text-lg" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDE - CHAT WINDOW */}
      <div className={`${!selectedChat ? 'hidden' : 'flex'} md:flex flex-1 relative z-10 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden`} style={{ backgroundColor: `${COLORS.dark}22` }}>
        {!selectedChat ? (
          // No chat selected
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-6">
              <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mx-auto mb-6 border border-white/10">
                <Icon icon="solar:chat-round-dots-bold-duotone" className="text-6xl text-primary/60" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                Select a conversation
              </h2>
              <p className="text-base text-white/50 max-w-sm mx-auto">
                Choose a chat from the list to start your mystical journey
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex">
            {/* CHAT MESSAGES AREA */}
            <div className="flex-1 flex flex-col">
              {/* Chat Header - Desktop */}
              <div className="hidden md:flex items-center justify-between p-5 border-b border-white/5 backdrop-blur-xl" style={{ backgroundColor: `${COLORS.surface}22` }}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center overflow-hidden border border-white/10">
                    {selectedChatData?.user_profile_pic_url ? (
                      <img
                        src={selectedChatData.user_profile_pic_url}
                        alt={selectedChatData.user_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Icon icon="ph:user-fill" className="text-white/80 text-2xl" />
                    )}
                  </div>

                  <div className="flex-1">
                    <h2 className="font-bold text-white text-lg" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                      {selectedChatData?.user_name || "Psychic"}
                    </h2>
                    <div className="flex items-center gap-2">
                      {isChatActive ? (
                        <>
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                          <span className="text-sm text-green-400 font-medium">Active now</span>
                        </>
                      ) : isPaused ? (
                        <>
                          <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                          <span className="text-sm text-orange-400 font-medium">Paused - Top up to continue • Will end in 30 min</span>
                        </>
                      ) : currentChatStatus === 'ENDED' ? (
                        <>
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                          <span className="text-sm text-red-400 font-medium">Session Ended</span>
                        </>
                      ) : currentChatStatus === 'REQUESTED' ? (
                        <>
                          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                          <span className="text-sm text-yellow-400 font-medium">Pending</span>
                        </>
                      ) : currentChatStatus === 'ARCHIVED' ? (
                        <>
                          <div className="w-2.5 h-2.5 rounded-full bg-gray-500" />
                          <span className="text-sm text-gray-400 font-medium">Cancelled</span>
                        </>
                      ) : (
                        <span className="text-sm text-white/40">
                          {currentChatStatus || 'Offline'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* End Chat Button for Active/Paused Chats */}
                  {(isChatActive || isPaused) && (
                    <button
                      onClick={() => setShowEndConfirm(true)}
                      className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-semibold transition-opacity hover:opacity-80 flex items-center gap-2"
                    >
                      <Icon icon="solar:logout-3-bold-duotone" className="text-base" />
                      End Chat
                    </button>
                  )}
                </div>
              </div>

              {/* Chat Header - Mobile */}
              <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-white/5 backdrop-blur-xl" style={{ backgroundColor: `${COLORS.surface}22` }}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    onClick={handleBackToList}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center flex-shrink-0 border border-white/10"
                  >
                    <Icon icon="solar:alt-arrow-left-linear" className="text-white text-base" />
                  </button>

                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center overflow-hidden border border-white/10 flex-shrink-0">
                    {selectedChatData?.user_profile_pic_url ? (
                      <img src={selectedChatData.user_profile_pic_url} alt={selectedChatData.user_name} className="w-full h-full object-cover" />
                    ) : (
                      <Icon icon="ph:user-fill" className="text-white/80 text-sm" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white text-sm truncate" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                        {selectedChatData?.user_name || "Psychic"}
                      </span>
                      {isChatActive && <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />}
                    </div>
                    <span className="text-xs text-white/40">
                      {isChatActive ? 'Active' : isPaused ? 'Paused' : currentChatStatus === 'ENDED' ? 'Ended' : currentChatStatus === 'REQUESTED' ? 'Pending' : currentChatStatus === 'ARCHIVED' ? 'Cancelled' : ''}
                    </span>
                  </div>
                </div>

                {(isChatActive || isPaused) && (
                  <button
                    onClick={() => setShowEndConfirm(true)}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-semibold flex items-center gap-1 flex-shrink-0"
                  >
                    <Icon icon="solar:logout-3-bold-duotone" className="text-xs" />
                    End
                  </button>
                )}
              </div>

              {/* Mobile Timer + Top Up Bar */}
              {(isChatActive || isPaused) && (
                <div className="md:hidden flex items-center justify-between px-5 py-3 border-b border-white/5" style={{ backgroundColor: `${COLORS.surface}33` }}>
                  <div className="flex items-center gap-2">
                    <Icon icon="ph:clock-fill" className="text-lg" style={{ color: sessionState.remainingSeconds && sessionState.remainingSeconds <= 120 ? '#f87171' : COLORS.primary }} />
                    <span className={`text-sm font-bold ${sessionState.remainingSeconds && sessionState.remainingSeconds <= 120 ? 'text-red-400' : 'text-white'}`}>
                      {isPaused ? 'Paused' : formatTime(sessionState.remainingSeconds)}
                    </span>
                    {!isPaused && sessionState.estimatedCost != null && (
                      <span className="text-xs text-white/40 ml-1">· ${(sessionState.estimatedCost || 0).toFixed(2)}</span>
                    )}
                  </div>
                  <button
                    onClick={handleTopUpClick}
                    className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/80 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Icon icon="ph:wallet-fill" className="text-sm" />
                    Top Up
                  </button>
                </div>
              )}

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
                {loadingMessages && (
                  <div className="flex justify-center py-12">
                    <div className="flex items-center gap-3 text-white/60 text-sm px-6 py-3 rounded-2xl bg-white/5 border border-white/10">
                      <Icon icon="solar:spinner-bold-duotone" className="text-xl animate-spin" />
                      <span>Loading messages...</span>
                    </div>
                  </div>
                )}

                {connectionStatus === 'connecting' && !loadingMessages && (
                  <div className="flex justify-center py-12">
                    <div className="flex items-center gap-3 text-white/60 text-sm px-6 py-3 rounded-2xl bg-white/5 border border-white/10">
                      <Icon icon="solar:spinner-bold-duotone" className="text-xl animate-spin" />
                      <span>Connecting...</span>
                    </div>
                  </div>
                )}

                {connectionStatus === 'error' && (
                  <div className="flex justify-center py-12">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-3">
                        <Icon icon="solar:danger-triangle-bold-duotone" className="text-red-400 text-3xl" />
                      </div>
                      <p className="text-base font-semibold text-red-400">Connection failed</p>
                      {wsError && <p className="text-sm text-white/40 mt-2">{wsError}</p>}
                    </div>
                  </div>
                )}
                {!loadingMessages && messages.length === 0 && connectionStatus === 'connected' && (
                  <div className="flex justify-center py-16">
                    <div className="text-center">
                      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mx-auto mb-4 border border-white/10">
                        <Icon icon="solar:chat-dots-bold-duotone" className="text-5xl text-primary/60" />
                      </div>
                      <p className="text-base text-white/50 font-medium">No messages yet</p>
                      <p className="text-sm text-white/30 mt-1">Start the conversation!</p>
                    </div>
                  </div>
                )}

                {/* Load More Button */}
                {!loadingMessages && allMessages.length > 0 && hasMoreMessages && (
                  <div className="flex justify-center py-4">
                    <button
                      onClick={handleLoadOlderMessages}
                      disabled={loadingOlderMessages}
                      className="px-6 py-3 rounded-2xl font-semibold text-sm transition-opacity hover:opacity-80 backdrop-blur-xl border border-white/10"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        color: 'white'
                      }}
                    >
                      {loadingOlderMessages ? (
                        <div className="flex items-center gap-2">
                          <Icon icon="solar:spinner-bold-duotone" className="text-lg animate-spin" />
                          <span>Loading...</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Icon icon="solar:arrow-up-bold-duotone" className="text-lg" />
                          <span>Load Older Messages</span>
                        </div>
                      )}
                    </button>
                  </div>
                )}

                {allMessages.map((msg, i) => {
                  // Check if this is a system message
                  if (msg.type === 'system' || msg.is_system) {
                    return (
                      <div
                        key={msg.id || i}
                        className="flex justify-center my-6"
                      >
                        <div className="px-5 py-2.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl">
                          <p className="text-xs text-white/50 font-medium">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  const senderId = msg.sender_id || msg.user_id;
                  const isMyMessage = senderId === user?.id;
                  const messageTime = msg.timestamp || msg.created_at;

                  return (
                    <div
                      key={msg.id || i}
                      className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[75%] ${isMyMessage ? '' : 'flex gap-3'}`}>
                        {/* Avatar for received messages */}
                        {!isMyMessage && (
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center overflow-hidden flex-shrink-0 mt-auto border border-white/10">
                            {selectedChatData?.user_profile_pic_url ? (
                              <img
                                src={selectedChatData.user_profile_pic_url}
                                alt={selectedChatData.user_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Icon icon="ph:user-fill" className="text-white/80 text-lg" />
                            )}
                          </div>
                        )}

                        <div>
                          <div
                            className={`rounded-3xl px-5 py-3.5 shadow-lg ${isMyMessage
                              ? 'rounded-br-lg text-white'
                              : 'rounded-bl-lg'
                              }`}
                            style={isMyMessage ? {
                              background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`
                            } : {
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              backdropFilter: 'blur(10px)',
                              color: 'white',
                              border: '1px solid rgba(255, 255, 255, 0.15)'
                            }}
                          >
                            <p className="text-sm leading-relaxed break-words font-medium">
                              {msg.content}
                            </p>
                          </div>
                          {messageTime && (
                            <p className={`text-xs text-white/30 mt-1.5 px-2 ${isMyMessage ? 'text-right' : 'text-left'}`}>
                              {new Date(messageTime).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Chat Ended Banner in Messages Area */}
                {currentChatStatus === 'ENDED' && messages.length > 0 && (
                  <div className="flex justify-center my-8">
                    <div className="px-6 py-4 rounded-2xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20 backdrop-blur-xl max-w-md">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                          <Icon icon="solar:close-circle-bold-duotone" className="text-red-400 text-xl" />
                        </div>
                        <p className="text-base font-bold text-white">Session Ended</p>
                      </div>
                      <p className="text-sm text-white/60 ml-11">
                        This chat session has been concluded. You can request a new session below.
                      </p>
                    </div>
                  </div>
                )}

                {/* Chat Pending Banner in Messages Area */}
                {currentChatStatus === 'REQUESTED' && (
                  <div className="flex justify-center my-8">
                    <div className="px-6 py-4 rounded-2xl bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 backdrop-blur-xl max-w-md">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center flex-shrink-0 animate-pulse">
                          <Icon icon="solar:clock-circle-bold-duotone" className="text-yellow-400 text-xl" />
                        </div>
                        <p className="text-base font-bold text-white">Waiting for Psychic</p>
                      </div>
                      <p className="text-sm text-white/60 ml-11">
                        Your chat request is pending. The psychic will join shortly.
                      </p>
                    </div>
                  </div>
                )}

                {/* Chat Cancelled/Rejected Banner in Messages Area */}
                {currentChatStatus === 'ARCHIVED' && (
                  <div className="flex justify-center my-8">
                    <div className="px-6 py-4 rounded-2xl bg-gradient-to-r from-gray-500/10 to-gray-600/10 border border-gray-500/20 backdrop-blur-xl max-w-md">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-gray-500/20 border border-gray-500/30 flex items-center justify-center flex-shrink-0">
                          <Icon icon="solar:close-square-bold-duotone" className="text-gray-400 text-xl" />
                        </div>
                        <p className="text-base font-bold text-white">Request Not Accepted</p>
                      </div>
                      <p className="text-sm text-white/60 ml-11">
                        This chat request was not accepted. You can try requesting again.
                      </p>
                    </div>
                  </div>
                )}

                <div ref={scrollRef} />
              </div>

              {/* Message Input - Only show for ACTIVE chats */}
              {isChatActive ? (
                <div className="p-6 border-t border-white/5 backdrop-blur-xl" style={{ backgroundColor: `${COLORS.surface}dd` }}>
                  <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                    <div className="flex-1 relative">
                      <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={
                          !isConnected
                            ? "Connecting..."
                            : sessionState.status === 'ENDED'
                              ? "Session ended"
                              : "Type your message..."
                        }
                        disabled={!isConnected || sessionState.status === 'ENDED' || !sessionState.isInputEnabled}
                        className="w-full bg-white/5 border border-white/10 rounded-3xl px-6 py-4 pr-12 text-white text-sm outline-none focus:border-primary/50 focus:bg-white/8 transition-all disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-white/30"
                      />
                      <Icon icon="ph:star-fill" className="absolute right-4 top-1/2 -translate-y-1/2 text-primary text-xl pointer-events-none" />
                    </div>
                    <button
                      type="submit"
                      disabled={!isConnected || !input.trim() || sessionState.status === 'ENDED' || !sessionState.isInputEnabled}
                      className="w-12 h-12 rounded-2xl flex items-center justify-center transition-opacity hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 shadow-lg text-white"
                      style={{
                        background: (!isConnected || !input.trim() || sessionState.status === 'ENDED' || !sessionState.isInputEnabled)
                          ? 'rgba(255, 255, 255, 0.1)'
                          : `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`
                      }}
                    >
                      <Icon icon="solar:plain-2-bold" className="text-xl" />
                    </button>
                  </form>
                  {!isConnected && (
                    <p className="text-xs text-white/40 mt-3 text-center">
                      {connectionStatus === 'connecting' ? 'Connecting to chat...' : 'Not connected'}
                    </p>
                  )}
                </div>
              ) : isPaused ? (
                <div className="p-6 border-t border-white/5 backdrop-blur-xl" style={{ backgroundColor: `${COLORS.surface}dd` }}>
                  <div className="p-5 rounded-2xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20 mb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0 animate-pulse">
                        <Icon icon="solar:pause-circle-bold-duotone" className="text-red-400 text-2xl" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white">Chat Paused</p>
                        <p className="text-xs text-white/60">
                          {sessionState.pauseReason === 'INSUFFICIENT_BALANCE'
                            ? 'Insufficient balance to continue'
                            : 'Session paused'}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-white/50 mb-4">
                      Top up to continue, or resume if you have enough balance. This chat will automatically end in 30 minutes if not resumed.
                    </p>
                    <div className="flex gap-2 text-xs text-white/40">
                      <Icon icon="solar:info-circle-bold-duotone" className="text-base flex-shrink-0" />
                      <span>Session cost so far: ${(sessionState.estimatedCost || 0).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={handleResumeChat}
                      className="flex-1 px-6 py-3 rounded-2xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg text-white flex items-center justify-center gap-2"
                      style={{
                        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                      }}
                    >
                      <Icon icon="solar:play-circle-bold-duotone" className="text-xl" />
                      Resume
                    </button>
                    <button
                      onClick={handleTopUpClick}
                      className="flex-1 px-6 py-3 rounded-2xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg text-white flex items-center justify-center gap-2"
                      style={{
                        background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`
                      }}
                    >
                      <Icon icon="solar:wallet-bold-duotone" className="text-xl" />
                      Top Up
                    </button>
                    <button
                      onClick={() => setShowEndConfirm(true)}
                      className="flex-1 px-6 py-3 rounded-2xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] border border-red-500/30 text-red-400 flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)'
                      }}
                    >
                      <Icon icon="solar:logout-3-bold-duotone" className="text-xl" />
                      End Chat
                    </button>
                  </div>
                </div>
              ) : currentChatStatus === 'REQUESTED' ? (
                <div className="p-6 border-t border-white/5 backdrop-blur-xl" style={{ backgroundColor: `${COLORS.surface}dd` }}>
                  <div className="p-5 rounded-2xl bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 mb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-2xl bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center flex-shrink-0 animate-pulse">
                        <Icon icon="solar:clock-circle-bold-duotone" className="text-yellow-400 text-2xl" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white">Waiting for Psychic</p>
                        <p className="text-xs text-white/60">Your chat request is pending</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <div className="flex gap-1 animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-yellow-400" />
                        <div className="w-2 h-2 rounded-full bg-yellow-400" />
                        <div className="w-2 h-2 rounded-full bg-yellow-400" />
                      </div>
                      <p className="text-xs text-white/50 ml-2">The psychic will respond shortly</p>
                    </div>
                  </div>
                  <button
                    onClick={handleCancelRequest}
                    disabled={updateChatStatusMutation.isPending}
                    className="w-full px-6 py-3 rounded-2xl font-semibold text-sm transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2 bg-white/5 text-white border border-white/10"
                  >
                    {updateChatStatusMutation.isPending ? (
                      <>
                        <Icon icon="solar:spinner-bold-duotone" className="text-lg animate-spin" />
                        Canceling...
                      </>
                    ) : (
                      <>
                        <Icon icon="solar:close-circle-bold-duotone" className="text-lg" />
                        Cancel Request
                      </>
                    )}
                  </button>
                </div>
              ) : currentChatStatus === 'ENDED' ? (
                <div className="p-6 border-t border-white/5 backdrop-blur-xl" style={{ backgroundColor: `${COLORS.surface}dd` }}>
                  <div className="mb-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                        <Icon icon="solar:close-circle-bold-duotone" className="text-red-400 text-2xl" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">Chat Ended</p>
                        <p className="text-xs text-white/50">This session has been concluded</p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => { setRequestError(null); setShowRequestModal(true); }}
                    disabled={requestChatMutation.isPending}
                    className="w-full px-8 py-4 rounded-2xl font-bold text-base transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg text-white"
                    style={{
                      background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`
                    }}
                  >
                    <Icon icon="solar:chat-round-line-bold-duotone" className="text-2xl" />
                    Request Again
                  </button>
                </div>
              ) : null}
            </div>

            {/* RIGHT SIDEBAR - PSYCHIC DETAILS */}
            {selectedChatData && (
              <div className="hidden lg:flex w-80 border-l border-white/5 flex-col backdrop-blur-xl overflow-y-auto" style={{ backgroundColor: `${COLORS.surface}dd` }}>
                <div className="p-6">
                  <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-white/40 mb-6" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                    Psychic Details
                  </h3>

                  {loadingPsychic ? (
                    <div className="flex justify-center py-12">
                      <Icon icon="solar:spinner-bold-duotone" className="text-3xl text-primary/60 animate-spin" />
                    </div>
                  ) : (
                    <>
                      {/* Psychic Avatar & Name */}
                      <div className="flex flex-col items-center text-center mb-8">
                        <div className="relative mb-4">
                          <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center overflow-hidden border-2 border-primary/30">
                            {(psychicDetails?.profile_picture_url || selectedChatData.user_profile_pic_url) ? (
                              <img
                                src={psychicDetails?.profile_picture_url || selectedChatData.user_profile_pic_url}
                                alt={psychicDetails?.username || selectedChatData.user_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Icon icon="ph:user-fill" className="text-white/80 text-5xl" />
                            )}
                          </div>
                          {psychicDetails?.is_verified && (
                            <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg text-white">
                              <Icon icon="solar:verified-check-bold" className="text-2xl" />
                            </div>
                          )}
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                          {psychicDetails?.username || selectedChatData.user_name}
                        </h2>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${psychicDetails?.is_online ? 'bg-green-500 animate-pulse' : 'bg-white/30'
                              }`}
                          />
                          <span className="text-sm font-medium" style={{ color: psychicDetails?.is_online ? '#4ade80' : 'rgba(255,255,255,0.6)' }}>
                            {psychicDetails?.is_online ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>

                      {/* Bio */}
                      {psychicDetails?.bio && (
                        <div className="mb-6 p-5 rounded-2xl bg-white/5 border border-white/10">
                          <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-white/40 mb-3 flex items-center gap-2">
                            <Icon icon="solar:document-text-bold-duotone" className="text-primary text-lg" />
                            About
                          </h4>
                          <p className="text-sm text-white/70 leading-relaxed">
                            {psychicDetails.bio}
                          </p>
                        </div>
                      )}

                      {/* Categories */}
                      {psychicDetails?.categories && psychicDetails.categories.length > 0 && (
                        <div className="mb-6">
                          <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-white/40 mb-3 flex items-center gap-2">
                            <Icon icon="solar:star-bold-duotone" className="text-primary text-lg" />
                            Specialties
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {psychicDetails.categories.map((category, idx) => (
                              <span
                                key={category.id}
                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30 text-xs font-bold text-white"
                              >
                                {category.title}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Rate */}
                      {psychicDetails?.price_per_second && (
                        <div className="mb-6 p-5 rounded-2xl bg-gradient-to-br from-white/5 to-white/10 border border-white/20">
                          <div className="flex items-center gap-3 mb-3">
                            <Icon icon="solar:dollar-minimalistic-bold-duotone" className="text-white text-2xl" />
                            <span className="text-xs font-bold uppercase tracking-[0.15em] text-white/40">Rate</span>
                          </div>
                          <p className="text-2xl font-bold text-white">
                            ${(psychicDetails.price_per_second * 60).toFixed(2)}
                            <span className="text-sm text-white/50 font-normal">/min</span>
                          </p>
                        </div>
                      )}

                      {/* Session Info */}
                      {(isChatActive || currentChatStatus === 'ACTIVE') && (
                        <div className="space-y-3 mb-6">
                          <div className="p-5 rounded-2xl bg-white/5 border border-white/20">
                            <div className="flex items-center gap-3 mb-3">
                              <Icon icon="solar:clock-circle-bold-duotone" className="text-white text-2xl" />
                              <span className="text-xs font-bold uppercase tracking-[0.15em] text-white/40">Duration</span>
                            </div>
                            <p className="text-3xl font-bold text-white tabular-nums">{formatTime(sessionState.elapsedSeconds)}</p>
                          </div>

                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.1 }}
                            className="p-5 rounded-2xl bg-gradient-to-br from-white/5 to-white/10 border border-white/20"
                          >
                            <div className="flex items-center gap-3 mb-3">
                              <Icon icon="solar:dollar-minimalistic-bold-duotone" className="text-white text-2xl" />
                              <span className="text-xs font-bold uppercase tracking-[0.15em] text-white/40">Session Cost</span>
                            </div>
                            <p className="text-3xl font-bold text-white tabular-nums">
                              ${(sessionState.estimatedCost || 0).toFixed(2)}
                            </p>
                          </motion.div>

                          {/* Remaining Time Display - Always show during active chat */}
                          <div
                            className={`p-5 rounded-2xl bg-gradient-to-br from-white/5 to-white/10 border transition-all duration-300 ${sessionState.showCriticalWarning
                              ? 'border-red-500 shadow-lg shadow-red-500/30'
                              : sessionState.showLowBalanceWarning
                                ? 'border-yellow-500 shadow-lg shadow-yellow-500/20'
                                : 'border-white/20'
                              }`}
                          >
                            <div className="flex items-center gap-3 mb-3">
                              <Icon
                                icon="solar:hourglass-bold-duotone"
                                className={`text-2xl ${sessionState.showCriticalWarning
                                  ? 'text-red-400'
                                  : sessionState.showLowBalanceWarning
                                    ? 'text-yellow-400'
                                    : 'text-white'
                                  }`}
                              />
                              <span className={`text-xs font-bold uppercase tracking-[0.15em] ${sessionState.showCriticalWarning
                                ? 'text-red-400'
                                : sessionState.showLowBalanceWarning
                                  ? 'text-yellow-400'
                                  : 'text-white/40'
                                }`}>
                                Time Remaining {sessionState.showCriticalWarning ? '🚨' : sessionState.showLowBalanceWarning ? '⚠️' : ''}
                              </span>
                            </div>

                            {/* Show skeleton if data not loaded yet */}
                            {sessionState.remainingSeconds === null ? (
                              <div className="animate-pulse">
                                <div className="h-9 bg-white/10 rounded w-24 mb-2"></div>
                              </div>
                            ) : (
                              <p className={`text-3xl font-bold tabular-nums ${sessionState.showCriticalWarning
                                ? 'text-red-400'
                                : sessionState.showLowBalanceWarning
                                  ? 'text-yellow-400'
                                  : 'text-white'
                                }`}>
                                {formatTime(Math.max(0, Math.floor(sessionState.remainingSeconds)))}
                              </p>
                            )}

                            {/* Countdown indicator */}
                            {(sessionState.showLowBalanceWarning || sessionState.showCriticalWarning) && sessionState.remainingSeconds !== null && (
                              <div className="mt-3 h-1 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${sessionState.showCriticalWarning ? 'bg-red-500' : 'bg-yellow-500'}`}
                                  style={{
                                    width: `${Math.max(0, Math.min(100, (sessionState.remainingSeconds / 300) * 100))}%`,
                                    transition: 'width 1s linear'
                                  }}
                                />
                              </div>
                            )}
                          </div>

                          {/* Low Balance Warning */}
                          {(sessionState.showLowBalanceWarning || sessionState.showCriticalWarning) && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`p-4 rounded-2xl border ${sessionState.showCriticalWarning
                                ? 'bg-gradient-to-r from-red-500/20 to-orange-500/20 border-red-500/50'
                                : 'bg-gradient-to-r from-yellow-500/10 to-red-500/10 border-yellow-500/30'
                                }`}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <Icon
                                  icon="solar:danger-bold-duotone"
                                  className={`text-xl ${sessionState.showCriticalWarning ? 'text-red-400' : 'text-yellow-400'}`}
                                />
                                <span className={`font-bold text-sm ${sessionState.showCriticalWarning ? 'text-red-400' : 'text-yellow-400'}`}>
                                  {sessionState.showCriticalWarning ? 'Critical: Balance Almost Depleted!' : 'Low Balance Warning'}
                                </span>
                              </div>
                              <p className="text-xs text-white/60 mb-3">
                                {sessionState.showCriticalWarning
                                  ? 'Less than 1 minute remaining! Your session will pause automatically when balance reaches $0. Top up immediately to continue.'
                                  : `You have approximately ${Math.floor((sessionState.remainingSeconds || 0) / 60)} minutes remaining. Top up now to avoid interruption.`
                                }
                              </p>

                              {/* Pause & Top Up Button */}
                              <button
                                onClick={handlePauseForTopUp}
                                disabled={!selectedChat}
                                className="w-full px-4 py-2.5 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{
                                  background: sessionState.showCriticalWarning
                                    ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                                    : `linear-gradient(135deg, ${COLORS.starGold} 0%, #F59E0B 100%)`,
                                  color: sessionState.showCriticalWarning ? 'white' : COLORS.dark
                                }}
                              >
                                <div className="flex items-center justify-center gap-2">
                                  <Icon icon="solar:pause-circle-bold-duotone" className="text-lg" />
                                  <span>{sessionState.showCriticalWarning ? 'Pause & Top Up Now!' : 'Pause & Top Up Balance'}</span>
                                </div>
                              </button>
                            </motion.div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Request New Chat Modal */}
      {showRequestModal && selectedChatData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="rounded-3xl border border-white/10 p-8 max-w-md w-full relative overflow-hidden" style={{ backgroundColor: COLORS.surface }}>
            {/* Decorative gradient */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />

            <div className="relative">
              <h3 className="text-2xl font-bold text-white mb-4" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                Request New Session
              </h3>
              <p className="text-sm text-white/60 mb-6">
                Send a message to {selectedChatData.user_name} to request a new reading session.
              </p>

              {requestError && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-300/90 font-medium text-center">
                    {requestError}
                  </p>
                </div>
              )}


              <textarea
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                placeholder="Enter your message..."
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 outline-none focus:border-primary/50 mb-4 resize-none"
                rows={4}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setRequestError(null); setShowRequestModal(false); }}
                  className="flex-1 px-6 py-3 rounded-2xl bg-white/5 text-white font-semibold text-sm hover:bg-white/10 transition-opacity border border-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRequestNewChat}
                  disabled={requestChatMutation.isPending}
                  className="flex-1 px-6 py-3 rounded-2xl font-bold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 shadow-lg text-white"
                  style={{ background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)` }}
                >
                  {requestChatMutation.isPending ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Session Summary Modal */}
      <SessionSummaryModal
        isOpen={showSessionSummaryModal}
        onClose={() => setShowSessionSummaryModal(false)}
        sessionData={sessionSummaryData}
        onTopUp={() => navigate("/client/wallet")}
      />

      {/* End Chat Confirmation Modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="rounded-3xl border border-red-500/20 p-8 max-w-md w-full relative overflow-hidden" style={{ backgroundColor: COLORS.surface }}>
            {/* Decorative gradient */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-red-500/10 to-transparent pointer-events-none" />

            <div className="relative">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center border border-red-500/30">
                  <Icon icon="solar:danger-triangle-bold-duotone" className="text-3xl text-red-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                    End Chat Session?
                  </h3>
                  <p className="text-sm text-white/50">
                    This action cannot be undone
                  </p>
                </div>
              </div>

              <p className="text-sm text-white/60 mb-6">
                Are you sure you want to end this chat session? You will be charged for the time spent, and the conversation will be closed.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="flex-1 px-6 py-3 rounded-2xl bg-white/5 text-white font-semibold text-sm hover:bg-white/10 transition-opacity border border-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEndChat}
                  disabled={updateChatStatusMutation.isPending}
                  className="flex-1 px-6 py-3 rounded-2xl font-bold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg text-white"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                  }}
                >
                  {updateChatStatusMutation.isPending ? 'Ending...' : 'End Chat'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientChat;

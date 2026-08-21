import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import "../../../styles/glass.css";
import { useChats } from "../hooks/useChats";
import { useRequestChat, useUpdateChatStatus } from "../hooks/useChatMutations";
import { usePsychicDetails } from "../hooks/usePsychicDetails";
import { getChatMessages, getChatSessionTime, resumeChat, pauseChatManual, pauseChat, Chat } from "../api/chatApi";
import { useTopUp } from "@/features/payment/context/TopUpContext";
import { usePayment } from "@/features/payment/hooks/usePayment";
import { useChatEventToasts } from "../hooks/useChatEventToasts";
import { useToast } from "../../../components/Toast/useToast";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useChatSessionState } from "../hooks/useChatSessionState";
import { SessionSummaryModal, formatDuration } from "../components/SessionSummaryModal";
import HallRoom from "@/features/hall/HallRoom";
import HallStage from "@/features/hall/HallStage";
import HallList from "@/features/hall/HallList";
import HallDialog from "@/features/hall/HallDialog";
import { MessageBubble } from "../components/MessageBubble";
import { TypingIndicator } from "../components/TypingIndicator";
import { SessionBar } from "../components/SessionBar";
import { PsychicProfileCard } from "../components/PsychicProfileCard";
import { useChatFacade } from "../hooks/useChatFacade";
import { useChatEvents } from "../hooks/useChatEvents";
import { ChatEventType, ChatMessage } from "../core/ChatEventTypes";
import "../../../styles/starfield.css";
import PageBackground from "../../../components/PageBackground";
import chatBackground from "../../../assets/backgrounds/chat-background.webp";
import { formatGbp } from "../../../lib/currency";

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
  // Guards the end-of-session modal so it is shown once, by the handler that
  // knows the REAL end reason. Prevents the client-side "timer hit 0" fallback
  // effect from overriding a graceful/manual end with the "ran out of balance"
  // variant (CHAT_ENDED forces remainingSeconds to 0 for every end).
  const hasHandledSessionEnd = useRef(false);

  useEffect(() => {
    toastRef.current = toast;
    queryClientRef.current = queryClient;
  }, [toast, queryClient]);

  // Local state
  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const clientTypingActiveRef = useRef(false);
  const clientTypingSignalAtRef = useRef(0);
  const clientTypingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  /* Presentation only: holds the list on screen for the hall's own crossfade
     (opacity 700ms, hall.css:142) while the room fades in behind it. It does
     not gate, delay or reorder handleEnterChat — that fires immediately. */
  const [leavingList, setLeavingList] = useState(false);
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

  const { open: openTopUp } = useTopUp();

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
  // Reader "typing…" indicator, driven by backend typing_start/typing_stop events.
  const [isReaderTyping, setIsReaderTyping] = useState(false);

  // ChatFacade for WebSocket connection
  const { facade, isConnected, error: wsError } = useChatFacade({
    role: 'client',
    chatId: selectedChat,
    autoConnect: true,
  });

  const stopClientTyping = useCallback(() => {
    if (clientTypingStopTimerRef.current) {
      clearTimeout(clientTypingStopTimerRef.current);
      clientTypingStopTimerRef.current = null;
    }
    if (clientTypingActiveRef.current) {
      clientTypingActiveRef.current = false;
      facade?.sendTyping(false);
    }
  }, [facade]);

  const handleClientInput = useCallback((value: string) => {
    setInput(value);
    if (!isConnected || !facade || !value) {
      stopClientTyping();
      return;
    }
    const now = Date.now();
    if (
      !clientTypingActiveRef.current ||
      now - clientTypingSignalAtRef.current >= 4000
    ) {
      facade.sendTyping(true);
      clientTypingActiveRef.current = true;
      clientTypingSignalAtRef.current = now;
    }
    if (clientTypingStopTimerRef.current) {
      clearTimeout(clientTypingStopTimerRef.current);
    }
    clientTypingStopTimerRef.current = setTimeout(stopClientTyping, 2000);
  }, [facade, isConnected, stopClientTyping]);

  useEffect(() => () => stopClientTyping(), [stopClientTyping]);

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
        status: msg.status,
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
    // A message arrived → stop showing the reader typing indicator.
    setIsReaderTyping(false);
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

  // Reader (Logan) typing indicator, from the backend typing_start/typing_stop
  // events broadcast during delivery. We don't send our own typing to the server.
  const handleTypingStart = useCallback(({ userId }: { userId: number }) => {
    if (user && userId === user.id) return; // ignore our own id (defensive)
    setIsReaderTyping(true);
  }, [user]);
  const handleTypingStop = useCallback(() => setIsReaderTyping(false), []);

  // The other party opened the conversation → flip our sent messages to "seen".
  const handleMessagesRead = useCallback(({ readerId }: { chatId: number; readerId: number }) => {
    if (!user || readerId === user.id) return;
    setMessages(prev =>
      prev.map(m =>
        !m.is_system && (m.sender_id === user.id || m.user_id === user.id)
          ? { ...m, status: 'READ' }
          : m
      )
    );
  }, [user]);

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
    hasHandledSessionEnd.current = true;

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

    // This handler knows the real end reason (MANUAL_EXIT vs INSUFFICIENT_FUNDS,
    // etc.), so claim the session-end here — the client-side timer-0 fallback
    // effect must not override the modal variant it just chose.
    hasHandledSessionEnd.current = true;

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

  const handleSessionStarted = useCallback((p: any) => {
    const payload = {
      chat_id: p.chatId,
      chat_status: 'ACTIVE' as const,
      session_started_at: p.startedAt || new Date().toISOString(),
      psychic_rate_per_second: p.psychicRate || 0,
      client_balance: p.clientBalance || 0,
      credit_balance: p.creditBalance,
      paid_balance: p.paidBalance,
      psychic_id: selectedChatData?.psychic_id || 0,
      // Carry the full session snapshot so the meter anchors correctly from the
      // WS event alone (doesn't depend on a follow-up sync to un-freeze).
      elapsed_seconds: p.elapsedSeconds ?? 0,
      estimated_cost: p.estimatedCost ?? 0,
      remaining_seconds: p.remainingSeconds,
      remaining_minutes: p.remainingMinutes,
      minutes_charged: p.minutesCharged,
      rate_per_minute: p.ratePerMinute,
      // session_started only fires once the client has joined → billing ACTIVE.
      session_status: (p.sessionStatus as any) ?? 'ACTIVE',
    };

    dispatch({ type: 'INITIALIZE', payload: payload as any });
  }, [dispatch, selectedChatData]);

  // Per-minute prepaid: a minute was charged upfront. Fold the fresh balance /
  // minute count through SYNC and refresh the header balance (spec b).
  const handleSessionMinuteCharged = useCallback((p: any) => {
    console.log('[ClientChat] Minute charged:', p);
    dispatch({
      type: 'SYNC',
      payload: {
        elapsed_seconds: p.elapsedSeconds ?? sessionState.elapsedSeconds,
        estimated_cost: p.estimatedCost,
        price_per_second: sessionState.psychicRatePerSecond,
        client_balance: p.clientBalance,
        credit_balance: p.creditBalance,
        paid_balance: p.paidBalance,
        remaining_seconds: p.remainingSeconds,
        session_status: 'ACTIVE',
        rate_per_minute: p.ratePerMinute,
        remaining_minutes: p.remainingMinutes,
        minutes_charged: p.minutesCharged,
      },
    });
    if (typeof p.clientBalance === 'number') {
      window.dispatchEvent(new CustomEvent('stardust:balance', { detail: p.clientBalance }));
    }
  }, [dispatch, sessionState.elapsedSeconds, sessionState.psychicRatePerSecond]);

  // Out-of-balance grace hold: not enough Stardust for the next minute.
  const handleSessionGrace = useCallback((p: any) => {
    console.log('[ClientChat] Grace hold:', p);
    dispatch({
      type: 'SYNC',
      payload: {
        elapsed_seconds: sessionState.elapsedSeconds,
        estimated_cost: p.estimatedCost,
        price_per_second: sessionState.psychicRatePerSecond,
        client_balance: p.clientBalance,
        credit_balance: p.creditBalance,
        paid_balance: p.paidBalance,
        session_status: 'GRACE',
        rate_per_minute: p.ratePerMinute,
        remaining_minutes: p.remainingMinutes,
        minutes_charged: p.minutesCharged,
        grace_seconds_left: p.graceSeconds,
        grace_reader_name: p.readerName,
      },
    });
    if (typeof p.clientBalance === 'number') {
      window.dispatchEvent(new CustomEvent('stardust:balance', { detail: p.clientBalance }));
    }
  }, [dispatch, sessionState.elapsedSeconds, sessionState.psychicRatePerSecond]);

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
      [ChatEventType.TYPING_START]: handleTypingStart,
      [ChatEventType.TYPING_STOP]: handleTypingStop,
      [ChatEventType.MESSAGES_READ]: handleMessagesRead,
      [ChatEventType.SESSION_INFO]: handleSessionInfo,
      [ChatEventType.SESSION_STARTED]: handleSessionStarted,
      [ChatEventType.SESSION_MINUTE_CHARGED]: handleSessionMinuteCharged,
      [ChatEventType.SESSION_GRACE]: handleSessionGrace,
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
    setIsReaderTyping(false);
  }, [selectedChat]);

  // NOTE: billing is anchored ONLY by an explicit click on the global
  // "Incoming Reading" Join button (IncomingReadingModal → joinChat). It must
  // NOT be triggered by viewing/rendering this conversation, so there is no
  // join-on-view effect here by design.

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

  // Reset the session-end guard when the chat changes.
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
        console.log('[ClientChat] Disconnecting WebSocket, end reason:', sessionState.endReason);
        facade.disconnect();
      }

      // Show session summary modal. CHAT_ENDED forces remainingSeconds to 0 for
      // EVERY end (manual or balance), so this fallback must key off the real
      // end reason — not assume "insufficient balance". A voluntary End Chat
      // carries "user_initiated" and gets the graceful (purple) variant.
      setSessionSummaryData({
        duration: sessionState.elapsedSeconds,
        cost: sessionState.estimatedCost,
        endReason: sessionState.endReason || "Session ended",
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
  }, [sessionState.status, sessionState.remainingSeconds, sessionState.elapsedSeconds, sessionState.estimatedCost, sessionState.endReason, facade, isConnected, selectedChat, refetch]);

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
        status: msg.status,
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

  // Auto-scroll to bottom when new messages arrive or the typing indicator toggles
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isReaderTyping]);

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
      stopClientTyping();
      await facade.sendMessage(input);
      setInput("");
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error("Failed to send message. Please try again.");
    }
  };

  // In-session "Add Stardust": open the real Stardust Glider (any amount + bonus
  // tiers). We pause the reading only once she commits (onBeforeCheckout), so the
  // clock isn't running during the Stripe round-trip; on return we resume (see the
  // payment-return effect — the glider's webhook credits Stardust but, unlike
  // /topup, does not itself resume the paused chat).
  const handleAddStardust = useCallback(() => {
    if (!selectedChat) return;
    const chatId = selectedChat;
    // Already in the out-of-balance GRACE hold? The session is paused, so don't
    // re-pause — instead flag the top-up (/topup → mark_topping_up) to extend the
    // hold from 60s to the 5-minute cap while checkout completes.
    const inGrace = sessionState.sessionStatus === 'GRACE';
    openTopUp({
      reason:
        "Add Stardust to keep your reading going — we'll pause the clock while you top up.",
      returnUrl: `/chats?chat_id=${chatId}&resume=1`,
      onBeforeCheckout: async () => {
        if (inGrace) {
          await pauseChat(chatId).catch(() => {});
        } else {
          await pauseChatManual(chatId);
        }
      },
    });
  }, [selectedChat, openTopUp, sessionState.sessionStatus]);

  const handlePauseForTopUp = handleAddStardust;
  const handleTopUpClick = handleAddStardust;

  // The hold panel's preset path: she picked one of the panel's amounts (all
  // rendered from stardustTiers, the same source as /billing's glider), so go
  // straight to checkout at that amount — the same pause step and the same
  // checkout call the glider modal makes, with only the amount differing.
  // "A larger offering" (onMoreOffering) still opens that glider modal.
  const { createStardustCheckoutSession } = usePayment();
  const handleAddStardustAt = useCallback(async (amountUsd: number) => {
    if (!selectedChat) return;
    const chatId = selectedChat;
    const inGrace = sessionState.sessionStatus === 'GRACE';
    try {
      // Mirror of the glider modal's onBeforeCheckout (above): pause the clock
      // before leaving for Stripe, or extend the grace hold while she pays.
      if (inGrace) await pauseChat(chatId).catch(() => {});
      else await pauseChatManual(chatId);
      // Redirects to Stripe; nothing runs after this on success.
      await createStardustCheckoutSession({
        amount_usd: amountUsd,
        return_url: `/chats?chat_id=${chatId}&resume=1`,
      });
    } catch {
      // Never strand her mid-hold: the glider modal has its own error surface.
      handleAddStardust();
    }
  }, [selectedChat, sessionState.sessionStatus, createStardustCheckoutSession, handleAddStardust]);

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

    if (status === 'success') {
      setSelectedChat(chatIdNum);

      // Glider top-up (resume=1): the Stardust webhook only credits balance — it
      // does NOT resume the chat — so we resume ourselves, retrying to let the
      // async credit land before /resume's own balance check runs.
      if (searchParams.get('resume') === '1') {
        toastRef.current.success('Payment received — resuming your reading…');
        let cancelled = false;
        (async () => {
          for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
            try {
              const data = await resumeChat(chatIdNum);
              dispatch({
                type: 'CHAT_RESUMED',
                payload: {
                  client_balance: data.client_balance,
                  elapsed_seconds: data.elapsed_seconds,
                  remaining_seconds: data.remaining_seconds,
                  rate_per_second: data.rate_per_second,
                },
              });
              refetch();
              break;
            } catch (e: any) {
              const detail = e?.response?.data?.detail || '';
              if (/insufficient/i.test(detail) && attempt < 3) {
                await new Promise((r) => setTimeout(r, 1500));
                continue;
              }
              if (attempt >= 3) {
                toastRef.current.info(
                  'Payment received. Tap Resume to continue your reading.'
                );
              }
              break;
            }
          }
          if (!cancelled) navigate(`/chats?chat_id=${chatIdNum}`, { replace: true });
        })();
        return () => {
          cancelled = true;
        };
      }

      // Legacy /topup flow: the backend webhook resumes automatically.
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

  // ── Deep-link: open a specific conversation straight from a notification ──
  // /chats?chat_id=123 (no payment `status`) selects that chat directly, instead
  // of dropping the client on the list to hunt for it while billing runs.
  useEffect(() => {
    const chatIdParam = searchParams.get('chat_id');
    const status = searchParams.get('status');
    if (chatIdParam && !status) {
      const id = parseInt(chatIdParam);
      if (Number.isFinite(id)) {
        setSelectedChat(id);
        // Clean the query so refresh/back doesn't re-trigger selection.
        navigate('/chats', { replace: true });
      }
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    if (!selectedChat) { setLeavingList(false); return; }
    const t = setTimeout(() => setLeavingList(false), 700);   /* hall.css:142 */
    return () => clearTimeout(t);
  }, [selectedChat]);

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

  // ── LOCAL-ONLY PREVIEW (dev only): /chats?preview=active|lowbalance|paused|ended|ranout
  //    Renders the redesigned session states with mock data so they can be eyeballed
  //    without a live reading. Remove this block (and ChatStatePreview below) before shipping.
  const previewMode = import.meta.env.DEV ? searchParams.get("preview") : null;
  if (previewMode) {
    return <ChatStatePreview mode={previewMode} />;
  }

  // ── ROOM STATE INJECTOR (dev only): /chats?force=<state> ──
  //    Renders the REAL HallRoom with its props set directly, so every state in
  //    ROOM-STATES.md can be forced without a live session and without touching
  //    billing. import.meta.env.DEV is replaced by `false` at build time, so
  //    this branch and ForcedRoomState below are dropped from the production
  //    bundle entirely. Identifier to grep for: HALLROOM_FORCE_INJECTOR.
  const forcedRoomState = import.meta.env.DEV ? searchParams.get("force") : null;
  if (forcedRoomState) {
    return <ForcedRoomState mode={forcedRoomState} />;
  }

  // --- LOADING STATE, in the hall's own language. Wording kept. ---
  if (loading) {
    return (
      <HallStage>
        <HallList
          chats={[]} onOpen={() => {}} onRefresh={refetch}
          onLeave={() => navigate('/psychics-browse')}
          page={1} totalPages={1} onPage={() => {}} showPager={false}
          note={{ title: "Loading your messages...", sub: "One moment while the hall opens." }}
        />
      </HallStage>
    );
  }

  // --- ERROR STATE, in the hall's own language. Wording kept. ---
  if (error) {
    return (
      <HallStage>
        <HallList
          chats={[]} onOpen={() => {}} onRefresh={refetch}
          onLeave={() => navigate('/psychics-browse')}
          page={1} totalPages={1} onPage={() => {}} showPager={false}
          note={{ title: "Unable to Load Chats", sub: String(error),
                  action: { label: "Try Again", onClick: refetch } }}
        />
      </HallStage>
    );
  }

  // --- Live session metrics for the status bar (SessionBar handles its own colour ramp) ---
  const remaining = sessionState.remainingSeconds;
  const isGrace = sessionState.sessionStatus === 'GRACE';
  // Per-minute model: clientBalance is the LIVE balance after each minute's
  // upfront debit — it IS the Stardust left (don't subtract cost again). Keep it
  // EXACT (no floor) so the counter matches the header (9.6, not 9).
  const stardustLeft =
    sessionState.clientBalance == null
      ? null
      : Math.max(0, sessionState.clientBalance);
  // Whole minutes of reading still available (current prepaid minute + affordable).
  const minutesLeft = sessionState.remainingMinutes;
  const psychicName =
    psychicDetails?.username || selectedChatData?.user_name || "Your reader";

  // Human-friendly "reading time left" for the low-balance banner — derived from
  // the live whole minutes remaining, not hardcoded, so it tracks reality.
  /* The hall's closing card is shown only when this visit actually latched a
     session end (duration or cost recorded at :334 / :384 / :664). Opening an
     already-ended conversation from the list latches nothing, so the card stays
     away and the banner is the single ended-state surface there. */
  const showsClosingCard =
    currentChatStatus === 'ENDED' &&
    (sessionSummaryData.duration > 0 || sessionSummaryData.cost > 0);

  const readingTimeLeftLabel = (() => {
    if (minutesLeft <= 0) {
      return remaining != null && remaining <= 60 ? "less than a minute" : "very little time";
    }
    return `about ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}`;
  })();

  /* ── THE HALL IS THE PAGE ──
     One HallStage, two views inside it: the conversation list and the room.
     The old two-column shell, PageBackground, starfield, Messages sidebar,
     empty-list card, rows, pagination and "Select a conversation" are gone —
     the list is now a hall surface laid out in the hall's own sky, and the room
     has the whole viewport with nothing beside it. Presentation only; every
     handler below is the one ClientChat already ran. */
  return (
    <HallStage>
      {!selectedChat ? (
        <HallList
          leaving={leavingList}
          chats={paginatedChats.map((chat: any) => ({
            id: chat.id,
            name: chat.user_name,
            avatarUrl: chat.user_profile_pic_url,
            status:
              chat.id === selectedChat && sessionState.chatId === selectedChat && sessionState.status
                ? sessionState.status
                : chat.status,
            lastMessage: chat.last_message,
          }))}
          onOpen={(id) => { setLeavingList(true); handleEnterChat(id); }}
          onRefresh={refetch}
          onLeave={() => navigate('/psychics-browse')}
          page={currentPage}
          totalPages={totalPages}
          onPage={(n) => setCurrentPage(n)}
          showPager={chats.length > CHATS_PER_PAGE}
          note={
            chats.length === 0
              ? { title: "Select a conversation",
                  sub: "Choose a chat from the list to start your mystical journey",
                  action: { label: "Browse psychics", onClick: () => navigate('/psychics-browse') } }
              : null
          }
        />
      ) : (
        <HallRoom
          /* FIX 1: the ended PHASE is gated on the same flag as the receipt
             data. Without this the hall drove itself to 'ended' from the chat
             status alone and drew the closing card with no values in it. A
             conversation that ended in an earlier visit latched nothing, so it
             stays in 'room' and shows the banner instead. No new server call. */
          phase={showsClosingCard ? 'ended' : isPaused ? 'pausing' : 'room'}
          onMoreOffering={handleTopUpClick}
          readerName={psychicName}
          readerPhoto={psychicDetails?.profile_picture_url || selectedChatData?.user_profile_pic_url}
          minutesLeft={minutesLeft}
          isPaused={isPaused}
          elapsedLabel={`${Math.floor((sessionState.elapsedSeconds || 0) / 60)}:${String(Math.floor((sessionState.elapsedSeconds || 0) % 60)).padStart(2, "0")} elapsed`}
          spentLabel={formatGbp(sessionState.estimatedCost || 0)}
          isConnected={isConnected}
          statusWord={isChatActive ? 'reading for you' : isPaused ? 'holding your place' : currentChatStatus === 'ENDED' ? 'ended' : currentChatStatus === 'REQUESTED' ? 'pending' : currentChatStatus === 'ARCHIVED' ? 'cancelled' : ''}
          messages={allMessages.map((msg: any, i: number) => ({
            id: msg.id ?? i,
            mine: (msg.sender_id || msg.user_id) === user?.id,
            text: msg.content,
            system: msg.type === 'system' || msg.is_system,
          }))}
          loadingMessages={loadingMessages}
          readerTyping={isReaderTyping && currentChatStatus === 'ACTIVE'}
          hasMore={hasMoreMessages}
          loadingMore={loadingOlderMessages}
          onLoadMore={handleLoadOlderMessages}
          banner={
            /* Exactly one ended-state surface. The hall's closing card is the
               ended surface whenever it renders, so the banner is suppressed
               then; it survives only for a conversation opened from the list
               that ended in an earlier visit, where no card is shown. Wording
               unchanged; hall typography via .hbanner (hall-list.css). */
            /* FIX 1: the allMessages.length > 0 requirement is gone — an ended
               conversation with an empty thread still has an ended state to
               show. Still mutually exclusive with the closing card. */
            currentChatStatus === 'ENDED' && !showsClosingCard
              ? { title: "Session Ended", body: "This chat session has been concluded. You can request a new session below." }
              : currentChatStatus === 'REQUESTED'
                ? { title: "Waiting for Psychic", body: "Your chat request is pending. Your reading should begin within 3 minutes." }
                : currentChatStatus === 'ARCHIVED'
                  ? { title: "Request Not Accepted", body: "This chat request was not accepted. You can try requesting again." }
                  : null
          }
          input={input}
          onInput={handleClientInput}
          onSend={() => handleSendMessage({ preventDefault: () => {} } as any)}
          composerPlaceholder={!isConnected ? "Connecting..." : sessionState.status === 'ENDED' ? "Session ended" : "Say anything…"}
          composerDisabled={!isConnected || sessionState.status === 'ENDED' || !sessionState.isInputEnabled}
          showComposer={!!isChatActive}
          lowBalance={
            isChatActive && sessionState.showCriticalWarning
              ? { text: `You have ${readingTimeLeftLabel} of reading time left. Add Stardust to keep your reading going.`,
                  action: "Add Stardust", onAction: handlePauseForTopUp }
              : null
          }
          hold={
            isPaused
              ? {
                  title: isGrace ? 'Out of Stardust' : 'Reading paused',
                  sub: isGrace
                    ? `Not enough Stardust for another minute with ${psychicName}.`
                    : sessionState.pauseReason === 'INSUFFICIENT_BALANCE'
                      ? 'Your Stardust ran low — add more to keep going.'
                      : 'Waiting for your reader to resume.',
                  body: isGrace
                    ? `Add Stardust in the next ${Math.max(0, sessionState.graceSecondsLeft)}s to carry on — the reading pauses here until you do, and closes on its own if you don't.`
                    : 'Add Stardust to keep going, or resume if you still have Stardust left. Your reading will close on its own after 30 minutes if it isn’t resumed.',
                  costLine: `Session cost so far: ${formatGbp(sessionState.estimatedCost || 0)}`,
                  graceSeconds: isGrace ? sessionState.graceSecondsLeft : null,
                  onResume: isGrace ? undefined : handleResumeChat,
                  onAddTime: (a: number) => handleAddStardustAt(a),
                  onEndNow: () => setShowEndConfirm(true),
                  perMinute: psychicDetails?.price_per_second != null
                    ? Math.round(psychicDetails.price_per_second * 60 * 100) / 100
                    : null,
                }
              : null
          }
          receipt={
            /* DECISION 1 — one constant, one source. The card reads the SAME
               latched values the old modal read (set at :334, :384 and :664
               from sessionState.elapsedSeconds / estimatedCost), not a live
               re-read, so a reading that has already ended still shows what it
               cost. Duration is rendered by formatDuration, the modal's own
               formatter — no second formatting function — so 35 seconds reads
               0:35 rather than flooring to 0. */
            showsClosingCard
              ? {
                  minutes: formatDuration(sessionSummaryData.duration),
                  total: formatGbp(sessionSummaryData.cost || 0),
                  perMinute: psychicDetails?.price_per_second != null
                    ? formatGbp(Math.round(psychicDetails.price_per_second * 60 * 100) / 100)
                    : null,
                  title: sessionState.endReason || 'Your reading has ended',
                  sub: "We hope it brought you clarity. You're welcome back any time. ",
                  onAgain: () => { setRequestError(null); setShowRequestModal(true); },
                  onBack: () => navigate('/psychics-browse'),
                }
              : null
          }
          notice={
            currentChatStatus === 'REQUESTED'
              ? { eyebrow: "Waiting for Psychic", title: "Your chat request is pending",
                  sub: "Usually within 3 minutes",
                  action: { label: "Cancel Request", onClick: handleCancelRequest,
                            pending: updateChatStatusMutation.isPending } }
              : null
          }
          onBack={handleBackToList}
          onLeave={() => navigate('/psychics-browse')}
          onOpenProfile={() => setShowProfileSheet(true)}
          onEnd={(isChatActive || isPaused) ? () => setShowEndConfirm(true) : undefined}
        />
      )}

      {/* Reader profile — mobile/tablet bottom sheet (lg shows the sidebar instead) */}
      {/* The reader — in the hall's own panel. Same words, same action. */}
      <HallDialog open={!!(showProfileSheet && selectedChatData)} onClose={() => setShowProfileSheet(false)} labelledBy="dlg-reader">
        <p className="eyebrow" id="dlg-reader">Your Reader</p>
        {loadingPsychic ? (
          <p className="psub">Loading…</p>
        ) : (
          <div className="hdlg-body">
            <PsychicProfileCard
              name={psychicName}
              avatarUrl={psychicDetails?.profile_picture_url || selectedChatData?.user_profile_pic_url}
              isVerified={psychicDetails?.is_verified}
              isOnline={psychicDetails?.is_online}
              bio={psychicDetails?.bio}
              categories={psychicDetails?.categories}
              pricePerSecond={psychicDetails?.price_per_second}
            />
          </div>
        )}
        <button className="quiet" id="dlg-reader-close" onClick={() => setShowProfileSheet(false)}>Close</button>
      </HallDialog>

      {/* Request New Chat Modal */}
      {/* Request New Session — every word kept. */}
      <HallDialog open={!!(showRequestModal && selectedChatData)}
                  onClose={() => { setRequestError(null); setShowRequestModal(false); }}
                  labelledBy="dlg-request">
        <p className="eyebrow">A new reading</p>
        <h1 className="ptitle" id="dlg-request">Request New Session</h1>
        <p className="psub">Send a message to {selectedChatData?.user_name} to request a new reading session.</p>
        {requestError && <p className="legal" role="alert" id="dlg-request-error">{requestError}</p>}
        <textarea
          value={requestMessage}
          onChange={(e) => setRequestMessage(e.target.value)}
          placeholder="Enter your message..."
          rows={4}
          id="dlg-request-text"
        />
        <button className="begin" id="dlg-request-send" onClick={handleRequestNewChat} disabled={requestChatMutation.isPending}>
          {requestChatMutation.isPending ? 'Sending...' : 'Send Request'}
        </button>
        <button className="quiet" id="dlg-request-cancel" onClick={() => { setRequestError(null); setShowRequestModal(false); }}>Cancel</button>
      </HallDialog>

      {/* The old "Your reading has ended" modal is gone from this route. The
          hall's own closing card is the single ended-state surface, fed from
          the same latched values this modal used. */}

      {/* End Chat Confirmation Modal */}
      {/* End Chat Session? — every word kept, both actions kept. */}
      <HallDialog open={showEndConfirm} onClose={() => setShowEndConfirm(false)} labelledBy="dlg-end">
        <p className="eyebrow">This action cannot be undone</p>
        <h1 className="ptitle" id="dlg-end">End Chat Session?</h1>
        <p className="psub">Are you sure you want to end this chat session? You will be charged for the time spent, and the conversation will be closed.</p>
        <button className="begin" id="dlg-end-confirm" onClick={handleEndChat} disabled={updateChatStatusMutation.isPending}>
          {updateChatStatusMutation.isPending ? 'Ending...' : 'End Chat'}
        </button>
        <button className="quiet" id="dlg-end-cancel" onClick={() => setShowEndConfirm(false)}>Cancel</button>
      </HallDialog>
    </HallStage>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL-ONLY PREVIEW HARNESS (dev only) — REMOVE BEFORE SHIPPING.
// Eyeball the redesigned session states without a live reading:
//   /chats?preview=active | lowbalance | paused | ended | ranout
// ─────────────────────────────────────────────────────────────────────────────
const PREVIEW_CFG: Record<
  string,
  { elapsed: number; remaining: number; balance: number; cost: number; status: string; paused: boolean }
> = {
  active: { elapsed: 372, remaining: 840, balance: 25, cost: 2.4, status: "ACTIVE", paused: false },
  warning: { elapsed: 660, remaining: 180, balance: 12, cost: 9.1, status: "ACTIVE", paused: false },
  lowbalance: { elapsed: 900, remaining: 48, balance: 6, cost: 5.2, status: "ACTIVE", paused: false },
  paused: { elapsed: 540, remaining: 300, balance: 10, cost: 4.0, status: "PAUSED", paused: true },
  ended: { elapsed: 612, remaining: 0, balance: 8, cost: 6.0, status: "ENDED", paused: false },
  ranout: { elapsed: 780, remaining: 0, balance: 0, cost: 12.0, status: "ENDED", paused: false },
};

const ChatStatePreview = ({ mode }: { mode: string }) => {
  const navigate = useNavigate();
  const { open: openTopUp } = useTopUp();
  const cfg = PREVIEW_CFG[mode] || PREVIEW_CFG.active;
  const [summary, setSummary] = useState<null | "normal" | "ranout">(
    mode === "ended" ? "normal" : mode === "ranout" ? "ranout" : null
  );

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };
  const remaining = cfg.remaining;
  const stardust = Math.max(0, Math.floor(cfg.balance - cfg.cost));
  const isActive = cfg.status === "ACTIVE";
  const isPaused = cfg.paused;
  const isEnded = cfg.status === "ENDED";
  const critical = isActive && remaining <= 60;
  const psychicName = "Selene Mare";

  const bubbles = [
    { mine: false, text: "Hello, love. I can feel there's something weighing on your heart today. Take a breath — we'll look at it together.", t: "7:41 PM" },
    { mine: true, text: "Hi Selene. Yes… it's about a decision I've been putting off.", t: "7:42 PM" },
    { mine: false, text: "The cards are showing me a path opening. You already know the answer — let's give you the clarity to trust it.", t: "7:42 PM" },
    { mine: true, text: "That feels right. Thank you 💜", t: "7:43 PM" },
  ];
  const modes = ["active", "warning", "lowbalance", "paused", "ended", "ranout"];

  return (
    <div className="h-[calc(100dvh-80px)] p-2 sm:p-4 relative overflow-hidden" style={{ fontFamily: "var(--gl-sans)", backgroundColor: "var(--gl-base)" }}>
      <PageBackground images={chatBackground} variant="glass" />
      <div className="relative z-10 mx-auto max-w-2xl h-full flex flex-col rounded-3xl border border-white/10 overflow-hidden backdrop-blur-xl" style={{ backgroundColor: `color-mix(in srgb, var(--gl-base) 13%, transparent)` }}>
        {/* Preview switcher (dev-only chrome) */}
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-white/5" style={{ backgroundColor: `color-mix(in srgb, var(--gl-glass) 40%, transparent)` }}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 mr-1">Preview</span>
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => navigate(`/chats?preview=${m}`)}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors"
              style={{
                borderColor: m === mode ? "var(--gl-accent)" : "rgba(255,255,255,0.12)",
                color: m === mode ? "var(--gl-accent)" : "rgba(255,255,255,0.6)",
                backgroundColor: m === mode ? `color-mix(in srgb, var(--gl-accent) 9%, transparent)` : "transparent",
              }}
            >
              {m}
            </button>
          ))}
          <button onClick={() => navigate("/chats")} className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-full border border-white/20 text-white/60">
            exit
          </button>
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-white/5" style={{ backgroundColor: `color-mix(in srgb, var(--gl-glass) 13%, transparent)` }}>
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/25 to-secondary/25 flex items-center justify-center border border-white/10">
            <Icon icon="ph:user-fill" className="text-white/80 text-xl" />
          </div>
          <div>
            <h2 className="font-bold text-white text-lg" style={{ fontFamily: "var(--gl-serif)" }}>{psychicName}</h2>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: isEnded ? "#FF6B6B" : isPaused ? "var(--gl-accent)" : "#22c55e" }} />
              <span className="text-sm font-medium" style={{ color: isEnded ? "#FF6B6B" : isPaused ? "var(--gl-accent)" : "#4ade80" }}>
                {isEnded ? "Session ended" : isPaused ? "Reading paused — add Stardust to resume" : "Active now"}
              </span>
            </div>
          </div>
        </div>

        {/* Session status bar */}
        {(isActive || isPaused) && (
          <SessionBar
            elapsedSeconds={cfg.elapsed}
            remainingSeconds={remaining}
            minutesLeft={remaining != null ? Math.ceil(remaining / 60) : null}
            stardust={stardust}
            isPaused={isPaused}
            isConnected={true}
            onTopUp={() => openTopUp({ returnUrl: "/chats?topup=1" })}
          />
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {bubbles.map((b, i) => {
            const startGroup = i === 0 || bubbles[i - 1].mine !== b.mine;
            return (
              <MessageBubble
                key={i}
                content={b.text}
                timestamp={new Date(Date.now() - (bubbles.length - i) * 60000).toISOString()}
                isOwn={b.mine}
                isGroupStart={startGroup}
                senderName={psychicName}
                status={b.mine ? (i === bubbles.length - 1 ? "READ" : "DELIVERED") : undefined}
              />
            );
          })}
        </div>

        {/* Low-balance banner */}
        {critical && (
          <div className="px-3 sm:px-6 pt-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border px-4 py-3.5" style={{ borderColor: `color-mix(in srgb, var(--gl-accent) 27%, transparent)`, backgroundColor: `color-mix(in srgb, var(--gl-accent) 8%, transparent)` }}>
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `color-mix(in srgb, var(--gl-accent) 13%, transparent)`, border: `1px solid color-mix(in srgb, var(--gl-accent) 27%, transparent)` }}>
                <Icon icon="solar:hourglass-line-duotone" className="text-2xl" style={{ color: "var(--gl-accent)" }} />
              </div>
              <p className="flex-1 text-sm leading-snug text-white/80">You have about <span className="font-bold text-white">1 minute</span> of reading time left. Add Stardust to keep your reading going.</p>
              <button onClick={() => navigate("/billing")} className="flex-shrink-0 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-transform hover:scale-[1.02]" style={{ backgroundColor: "var(--gl-accent)", color: "var(--gl-base)" }}>
                <Icon icon="ph:sparkle-fill" className="text-base" />Add Stardust
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        {isEnded ? (
          <div className="p-5 sm:p-6 border-t border-white/5" style={{ backgroundColor: `color-mix(in srgb, var(--gl-glass) 87%, transparent)` }}>
            <div className="mb-4 flex items-start gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/10">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `color-mix(in srgb, var(--gl-accent) 12%, transparent)`, border: `1px solid color-mix(in srgb, var(--gl-accent) 27%, transparent)` }}>
                <Icon icon="solar:moon-stars-bold-duotone" className="text-2xl" style={{ color: "var(--gl-accent)" }} />
              </div>
              <div>
                <p className="text-base font-bold text-white" style={{ fontFamily: "var(--gl-serif)" }}>Your reading has ended</p>
                <p className="text-sm text-white/55 mt-0.5">We hope it brought you clarity. You're welcome back any time.</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button onClick={() => navigate("/psychics-browse")} className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-sm text-white shadow-lg flex items-center justify-center gap-2" style={{ background: `linear-gradient(135deg, var(--gl-accent) 0%, var(--gl-accent) 100%)` }}>
                <Icon icon="solar:chat-round-line-bold-duotone" className="text-xl" />Book another reading
              </button>
              <button onClick={() => navigate("/psychics-browse")} className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-sm text-white border border-white/15 bg-white/[0.04] flex items-center justify-center gap-2">
                <Icon icon="solar:users-group-rounded-bold-duotone" className="text-xl" style={{ color: "var(--gl-accent)" }} />Browse psychics
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6 border-t border-white/5" style={{ backgroundColor: `color-mix(in srgb, var(--gl-glass) 87%, transparent)` }}>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-white/5 border border-white/10 rounded-3xl px-6 py-4 text-white/30 text-sm">{isPaused ? "Reading paused" : "Type your message…"}</div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{ background: `linear-gradient(135deg, var(--gl-accent) 0%, var(--gl-accent) 100%)` }}>
                <Icon icon="solar:plain-2-bold" className="text-xl" />
              </div>
            </div>
          </div>
        )}
      </div>

      <SessionSummaryModal
        isOpen={summary !== null}
        onClose={() => setSummary(null)}
        sessionData={{ duration: cfg.elapsed, cost: cfg.cost, endReason: summary === "ranout" ? "Session ended - insufficient balance" : "Session ended" }}
        onTopUp={() => openTopUp({ returnUrl: "/chats?topup=1" })}
      />
    </div>
  );
};

export default ClientChat;


/* ══════════════════════════════════════════════════════════════════════════
   HALLROOM_FORCE_INJECTOR — development only, absent from production builds.
   Drives the real HallRoom component with hand-set props. It calls no API, runs
   no timer and touches no billing: every "action" below just records that it
   fired, so a state's controls can be clicked and proven without spending
   anything. Reached at /chats?force=<state>.
   ══════════════════════════════════════════════════════════════════════════ */
const FORCED_STATES = [
  "active", "empty", "typing", "disconnected", "loading", "older",
  "lowbalance", "paused", "grace", "ended", "requested", "archived",
] as const;

function ForcedRoomState({ mode }: { mode: string }) {
  const [input, setInput] = React.useState("");
  const [log, setLog] = React.useState<string[]>([]);
  const [dlg, setDlg] = React.useState<string | null>(null);
  const navigate = useNavigate();
  const fire = (what: string) => setLog((l) => [...l, what]);

  const msgs = [
    { id: 1, mine: true, text: "He stopped answering six weeks ago. Daniel, born 14 August 1992." },
    { id: 2, mine: false, text: "daniel, six weeks of that silence after something that felt so right" },
    { id: 3, mine: false, text: "that shift is real and you felt it before you could even name it" },
  ];
  const isPaused = mode === "paused" || mode === "grace";
  const isEnded = mode === "ended";
  const phase = isEnded ? "ended" : isPaused ? "pausing" : "room";

  return (
    <>
      <HallRoom
        phase={phase as any}
        readerName="Valentina"
        readerPhoto={null}
        minutesLeft={mode === "lowbalance" ? 1 : isPaused ? null : 38}
        isPaused={isPaused}
        elapsedLabel="12:04 elapsed"
        spentLabel="£4.20"
        isConnected={mode !== "disconnected"}
        statusWord={isEnded ? "ended" : isPaused ? "holding your place" : mode === "requested" ? "pending" : "reading for you"}
        messages={mode === "empty" || mode === "loading" || mode === "requested" ? [] : msgs}
        loadingMessages={mode === "loading"}
        readerTyping={mode === "typing"}
        hasMore={mode === "older"}
        loadingMore={false}
        onLoadMore={() => fire("load older")}
        banner={
          mode === "ended" ? { title: "Session Ended", body: "This chat session has been concluded. You can request a new session below." }
          : mode === "requested" ? { title: "Waiting for Psychic", body: "Your chat request is pending. Your reading should begin within 3 minutes." }
          : mode === "archived" ? { title: "Request Not Accepted", body: "This chat request was not accepted. You can try requesting again." }
          : null
        }
        input={input}
        onInput={setInput}
        onSend={() => { fire("send: " + input); setInput(""); }}
        composerPlaceholder={mode === "disconnected" ? "Connecting..." : isEnded ? "Session ended" : "Say anything…"}
        composerDisabled={mode === "disconnected"}
        showComposer={!isPaused && !isEnded && mode !== "requested" && mode !== "archived"}
        lowBalance={mode === "lowbalance"
          ? { text: "You have about 1 minute of reading time left. Add Stardust to keep your reading going.",
              action: "Add Stardust", onAction: () => fire("add stardust (banner)") }
          : null}
        hold={isPaused ? {
          title: mode === "grace" ? "Out of Stardust" : "Reading paused",
          sub: mode === "grace" ? "Not enough Stardust for another minute with Valentina."
                                : "Waiting for your reader to resume.",
          body: mode === "grace"
            ? "Add Stardust in the next 45s to carry on — the reading pauses here until you do, and closes on its own if you don't."
            : "Add Stardust to keep going, or resume if you still have Stardust left.",
          costLine: "Session cost so far: £62.40",
          graceSeconds: mode === "grace" ? 45 : null,
          onResume: mode === "grace" ? undefined : () => fire("resume"),
          onAddTime: (a: number) => fire("top up £" + a),
          onEndNow: () => fire("end now"),
          perMinute: 5.2,
        } : null}
        receipt={isEnded ? {
          minutes: 24, total: "£124.80", perMinute: "£5.20",
          title: "Your reading has ended",
          sub: "We hope it brought you clarity. You're welcome back any time. ",
          onAgain: () => fire("book another"), onBack: () => fire("browse psychics"),
          onRate: (n: number) => fire("rated " + n),
        } : null}
        notice={mode === "requested" ? {
          eyebrow: "Waiting for Psychic", title: "Your chat request is pending",
          sub: "Usually within 3 minutes",
          action: { label: "Cancel Request", onClick: () => fire("cancel request") },
        } : null}
        onMoreOffering={() => fire("larger offering")}
        onBack={() => fire("back")}
        onOpenProfile={() => { fire("open profile"); setDlg("reader"); }}
        onEnd={!isEnded ? () => { fire("end"); setDlg("end"); } : undefined}
      />

      {/* the four dialogs, driven with local state so each can be proven */}
      <HallDialog open={dlg === "reader"} onClose={() => setDlg(null)} labelledBy="dlg-reader">
        <p className="eyebrow" id="dlg-reader">Your Reader</p>
        <p className="psub">Valentina</p>
        <button className="quiet" id="dlg-reader-close" onClick={() => setDlg(null)}>Close</button>
      </HallDialog>

      <HallDialog open={dlg === "request"} onClose={() => setDlg(null)} labelledBy="dlg-request">
        <p className="eyebrow">A new reading</p>
        <h1 className="ptitle" id="dlg-request">Request New Session</h1>
        <p className="psub">Send a message to Valentina to request a new reading session.</p>
        <textarea id="dlg-request-text" rows={4} placeholder="Enter your message..." defaultValue="" />
        <button className="begin" id="dlg-request-send" onClick={() => { fire("send request"); setDlg(null); }}>Send Request</button>
        <button className="quiet" id="dlg-request-cancel" onClick={() => setDlg(null)}>Cancel</button>
      </HallDialog>

      <HallDialog open={dlg === "summary"} onClose={() => setDlg(null)} labelledBy="dlg-summary">
        <p className="eyebrow">Your reading</p>
        <h1 className="ptitle" id="dlg-summary">Your reading has ended</h1>
        <p className="psub">We hope it brought you clarity. You're welcome back any time.</p>
        <div className="hdlg-rows">
          <div className="hdlg-row"><span className="slab">Duration</span><b>24m 00s</b></div>
          <div className="hdlg-row"><span className="slab">Stardust spent</span><b>124.80</b></div>
        </div>
        <button className="begin" id="dlg-summary-again" onClick={() => { fire("book another"); setDlg(null); }}>Book another reading</button>
        <button className="quiet" id="dlg-summary-close" onClick={() => setDlg(null)}>Close</button>
      </HallDialog>

      <HallDialog open={dlg === "end"} onClose={() => setDlg(null)} labelledBy="dlg-end">
        <p className="eyebrow">This action cannot be undone</p>
        <h1 className="ptitle" id="dlg-end">End Chat Session?</h1>
        <p className="psub">Are you sure you want to end this chat session? You will be charged for the time spent, and the conversation will be closed.</p>
        <button className="begin" id="dlg-end-confirm" onClick={() => { fire("end chat"); setDlg(null); }}>End Chat</button>
        <button className="quiet" id="dlg-end-cancel" onClick={() => setDlg(null)}>Cancel</button>
      </HallDialog>
      {/* The harness bar sits at the TOP and the room is pushed down by exactly
          its height, so it can never cover the composer it is meant to prove. */}
      <style>{`#forcebar{top:0;bottom:auto;border-top:0;border-bottom:1px solid rgba(232,200,139,.22);}
        html:has(#forcebar) .room{padding-top:var(--forcebar,0px);}`}</style>
      <div className="mockbar" id="forcebar" ref={(el) => {
        if (el) document.documentElement.style.setProperty("--forcebar", el.getBoundingClientRect().height + "px");
      }}>
        <span>forced state</span>
        {FORCED_STATES.map((m) => (
          <button key={m} aria-pressed={m === mode} onClick={() => navigate(`/chats?force=${m}`)}>{m}</button>
        ))}
        <button id="open-request" onClick={() => setDlg("request")}>request modal</button>
        <button id="open-summary" onClick={() => setDlg("summary")}>summary modal</button>
        <button id="forcelog" data-log={log.join("|")}>fired: {log.length}</button>
      </div>
    </>
  );
}

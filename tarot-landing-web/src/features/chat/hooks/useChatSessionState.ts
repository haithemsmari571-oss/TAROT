import { useReducer, useEffect, useCallback, useRef } from 'react';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { NotificationType } from '@/features/notifications/types/notification.types';
import { ChatSessionState, ChatSessionAction } from '../types/session.types';
import { getChatSessionTime } from '../api/chatApi';
// Timer runs independently on client side
// Initial data fetched from REST API on mount
// No syncing with backend - countdown until 0 then auto-end

const initialState: ChatSessionState = {
  chatId: null,
  status: null,
  psychicId: null,
  sessionStartedAt: null,
  elapsedSeconds: 0,
  psychicRatePerSecond: 0,
  estimatedCost: 0,
  clientBalance: null,
  creditBalance: null,
  paidBalance: null,
  sessionStatus: null,
  remainingBalance: null,
  remainingSeconds: null,
  isInputEnabled: false,
  showLowBalanceWarning: false,
  showCriticalWarning: false,
  showEndingWarning: false,
  showCriticalEndingWarning: false,
  isPaused: false,
  pauseReason: null,
  endReason: null,
  userRole: 'CLIENT', // Default, can be passed as param
};

export function chatSessionReducer(
  state: ChatSessionState,
  action: ChatSessionAction
): ChatSessionState {
  switch (action.type) {
    case 'INITIALIZE':
    case 'CHAT_ACCEPTED': {
      console.log('[useChatSessionState] INITIALIZE/CHAT_ACCEPTED action:', action);
      const {
        chat_id,
        chat_status,
        session_started_at,
        psychic_rate_per_second,
        client_balance,
        psychic_id,
        elapsed_seconds = 0,
        estimated_cost = 0,
        // Default AWAITING_JOIN: never assume billing has started at accept. The
        // meter stays frozen until a session-time sync confirms the client joined.
        session_status = 'AWAITING_JOIN',
        credit_balance,
        paid_balance,
      } = action.payload;

      // Calculate remaining balance and time based on current session state
      const effectiveBalance = client_balance - estimated_cost;
      const remainingSeconds = psychic_rate_per_second > 0
        ? Math.max(0, effectiveBalance / psychic_rate_per_second)
        : null;

      // Only bill/warn while the client has actually joined.
      const isBilling = session_status === 'ACTIVE';

      // If balance already depleted (while billing), immediately set to ENDED.
      const actualStatus = (chat_status === 'ACTIVE' && isBilling && remainingSeconds !== null && remainingSeconds <= 0)
        ? 'ENDED'
        : chat_status;

      const newState = {
        ...state,
        chatId: chat_id,
        status: actualStatus,
        sessionStatus: session_status,
        psychicId: psychic_id,
        sessionStartedAt: session_started_at,
        psychicRatePerSecond: psychic_rate_per_second,
        clientBalance: client_balance,
        creditBalance: credit_balance ?? state.creditBalance,
        paidBalance: paid_balance ?? state.paidBalance,
        elapsedSeconds: elapsed_seconds,
        estimatedCost: estimated_cost,
        isInputEnabled: actualStatus === 'ACTIVE' && isBilling && (remainingSeconds === null || remainingSeconds > 0),
        isPaused: false,
        remainingBalance: effectiveBalance,
        remainingSeconds,
        // Fresh session: no end reason yet. If it initializes already-depleted,
        // that IS a balance end.
        endReason: actualStatus === 'ENDED' ? 'insufficient_balance' : null,
        // Balance warnings only make sense once the meter is actually running.
        showLowBalanceWarning: isBilling && remainingSeconds !== null && remainingSeconds > 60 && remainingSeconds <= 300,
        showCriticalWarning: isBilling && remainingSeconds !== null && remainingSeconds <= 60,
      };

      console.log('[useChatSessionState] New state after INITIALIZE:', newState);
      console.log('[useChatSessionState] Balance check - effectiveBalance:', effectiveBalance, 'remainingSeconds:', remainingSeconds, 'actualStatus:', actualStatus);
      return newState;
    }
    
    case 'TICK': {
      // Only accrue while the client has joined and billing is live. During
      // AWAITING_JOIN the meter is frozen (the backend isn't charging yet).
      if (state.isPaused || state.status !== 'ACTIVE' || state.sessionStatus !== 'ACTIVE') {
        return state;
      }
      
      const newElapsed = state.elapsedSeconds + 1;
      const newCost = newElapsed * state.psychicRatePerSecond;
      const newRemaining = state.clientBalance !== null 
        ? state.clientBalance - newCost 
        : null;
      
      const remainingSeconds = newRemaining !== null && state.psychicRatePerSecond > 0
        ? Math.max(0, newRemaining / state.psychicRatePerSecond)
        : null;
      
      // Auto-end when timer reaches 0
      if (remainingSeconds !== null && remainingSeconds <= 0) {
        console.log('[useChatSessionState] Timer reached 0 - auto-ending session');
        return {
          ...state,
          elapsedSeconds: newElapsed,
          estimatedCost: newCost,
          remainingBalance: 0,
          remainingSeconds: 0,
          status: 'ENDED',
          endReason: 'insufficient_balance',
          isInputEnabled: false,
          showLowBalanceWarning: false,
          showCriticalWarning: false,
          showEndingWarning: false,
          showCriticalEndingWarning: false,
        };
      }
      
      return {
        ...state,
        elapsedSeconds: newElapsed,
        estimatedCost: newCost,
        remainingBalance: newRemaining,
        remainingSeconds,
        showLowBalanceWarning: remainingSeconds !== null && remainingSeconds > 60 && remainingSeconds <= 300,
        showCriticalWarning: remainingSeconds !== null && remainingSeconds <= 60,
        showEndingWarning: remainingSeconds !== null && remainingSeconds > 10 && remainingSeconds <= 60,
        showCriticalEndingWarning: remainingSeconds !== null && remainingSeconds <= 10,
        isInputEnabled: remainingSeconds > 0,
      };
    }
    
    case 'SYNC': {
      // Periodic re-anchor to the backend's join-anchored meter. This is the
      // source of truth: it corrects any local TICK drift and, crucially, flips
      // AWAITING_JOIN → ACTIVE the moment the client actually joins. Don't touch
      // a session that's already paused/ended locally.
      if (state.status === 'ENDED' || state.isPaused) {
        return state;
      }

      const {
        elapsed_seconds,
        estimated_cost,
        price_per_second,
        client_balance,
        credit_balance,
        paid_balance,
        remaining_seconds,
        session_status,
      } = action.payload;

      const nextSessionStatus = session_status ?? state.sessionStatus;
      const isBilling = nextSessionStatus === 'ACTIVE';
      const rate = price_per_second ?? state.psychicRatePerSecond;

      const effectiveBalance = client_balance - estimated_cost;
      const remainingSeconds = remaining_seconds ?? (
        rate > 0 ? Math.max(0, effectiveBalance / rate) : null
      );

      // If the backend meter has depleted while billing, end locally.
      if (isBilling && remainingSeconds !== null && remainingSeconds <= 0) {
        return {
          ...state,
          sessionStatus: nextSessionStatus,
          psychicRatePerSecond: rate,
          clientBalance: client_balance,
          creditBalance: credit_balance ?? state.creditBalance,
          paidBalance: paid_balance ?? state.paidBalance,
          elapsedSeconds: elapsed_seconds,
          estimatedCost: estimated_cost,
          remainingBalance: 0,
          remainingSeconds: 0,
          status: 'ENDED',
          endReason: 'insufficient_balance',
          isInputEnabled: false,
          showLowBalanceWarning: false,
          showCriticalWarning: false,
          showEndingWarning: false,
          showCriticalEndingWarning: false,
        };
      }

      return {
        ...state,
        sessionStatus: nextSessionStatus,
        psychicRatePerSecond: rate,
        clientBalance: client_balance,
        creditBalance: credit_balance ?? state.creditBalance,
        paidBalance: paid_balance ?? state.paidBalance,
        elapsedSeconds: elapsed_seconds,
        estimatedCost: estimated_cost,
        remainingBalance: effectiveBalance,
        remainingSeconds,
        isInputEnabled: state.status === 'ACTIVE' && isBilling && (remainingSeconds === null || remainingSeconds > 0),
        showLowBalanceWarning: isBilling && remainingSeconds !== null && remainingSeconds > 60 && remainingSeconds <= 300,
        showCriticalWarning: isBilling && remainingSeconds !== null && remainingSeconds <= 60,
        showEndingWarning: isBilling && remainingSeconds !== null && remainingSeconds > 10 && remainingSeconds <= 60,
        showCriticalEndingWarning: isBilling && remainingSeconds !== null && remainingSeconds <= 10,
      };
    }

    case 'CHAT_PAUSED': {
      return {
        ...state,
        status: 'PAUSED',
        isPaused: true,
        pauseReason: action.payload.reason,
        isInputEnabled: false,
        elapsedSeconds: action.payload.elapsed_seconds,
        estimatedCost: action.payload.estimated_cost,
      };
    }
    
    case 'CHAT_RESUMED': {
      // Reinitialize timer with new values from backend
      const { 
        client_balance, 
        elapsed_seconds, 
        remaining_seconds,
        rate_per_second 
      } = action.payload;
      
      const effectiveBalance = client_balance;
      const remainingSecs = remaining_seconds ?? (
        rate_per_second > 0 
          ? Math.max(0, effectiveBalance / rate_per_second)
          : null
      );
      
      const estimatedCost = (elapsed_seconds ?? state.elapsedSeconds) * (rate_per_second ?? state.psychicRatePerSecond);
      
      return {
        ...state,
        status: 'ACTIVE',
        sessionStatus: 'ACTIVE',
        isPaused: false,
        pauseReason: null,
        isInputEnabled: true,
        clientBalance: client_balance,
        elapsedSeconds: elapsed_seconds ?? state.elapsedSeconds,
        remainingSeconds: remainingSecs,
        remainingBalance: effectiveBalance - estimatedCost,
        estimatedCost,
        psychicRatePerSecond: rate_per_second ?? state.psychicRatePerSecond,
        showLowBalanceWarning: remainingSecs !== null && remainingSecs > 60 && remainingSecs <= 300,
        showCriticalWarning: remainingSecs !== null && remainingSecs <= 60,
      };
    }
    
    case 'CHAT_ENDED': {
      // Preserve final session stats if provided
      const finalElapsedSeconds = action.payload?.elapsed_seconds ?? state.elapsedSeconds;
      const finalEstimatedCost = action.payload?.estimated_cost ?? state.estimatedCost;
      
      console.log('[useChatSessionState] CHAT_ENDED reducer:', {
        chatId: state.chatId,
        elapsed: finalElapsedSeconds,
        cost: finalEstimatedCost,
        reason: action.payload?.reason,
      });
      
      return {
        ...state,
        status: 'ENDED',
        // Preserve the REAL reason (e.g. "user_initiated" for a voluntary End
        // Chat) so the summary modal doesn't default to the balance variant.
        endReason: action.payload?.reason ?? state.endReason ?? 'user_initiated',
        isInputEnabled: false,
        isPaused: false,
        elapsedSeconds: finalElapsedSeconds,
        estimatedCost: finalEstimatedCost,
        remainingSeconds: 0, // Force to 0 when ended
        showEndingWarning: false,
        showCriticalEndingWarning: false,
      };
    }

    case 'SESSION_ENDED_NO_BALANCE': {
      console.log('[useChatSessionState] SESSION_ENDED_NO_BALANCE reducer:', {
        chatId: state.chatId,
        currentElapsed: state.elapsedSeconds,
        currentCost: state.estimatedCost,
      });
      
      return {
        ...state,
        status: 'ENDED',
        endReason: 'insufficient_balance',
        isInputEnabled: false,
        isPaused: false,
        remainingSeconds: 0, // Force to 0 when ended
        showEndingWarning: false,
        showCriticalEndingWarning: false,
      };
    }

    case 'UPDATE_BALANCE': {
      const newBalance = action.payload.balance;
      const remainingSeconds = state.psychicRatePerSecond > 0
        ? (newBalance - state.estimatedCost) / state.psychicRatePerSecond
        : null;
      
      const isBilling = state.sessionStatus === 'ACTIVE';
      return {
        ...state,
        clientBalance: newBalance,
        remainingBalance: newBalance - state.estimatedCost,
        remainingSeconds,
        showLowBalanceWarning: isBilling && remainingSeconds !== null && remainingSeconds > 60 && remainingSeconds <= 300,
        showCriticalWarning: isBilling && remainingSeconds !== null && remainingSeconds <= 60,
      };
    }
    
    case 'RESET': {
      console.log('[useChatSessionState] RESET action triggered');
      return initialState;
    }
    
    default:
      console.log('[useChatSessionState] Unknown action type:', action);
      return state;
  }
}

interface UseChatSessionStateOptions {
  chatId: number | null;
  currentChatStatus?: string | null; // Pass current chat status from parent
  userRole?: 'CLIENT' | 'PSYCHIC' | 'ADMIN';
  onBalanceWarning?: () => void;
  onSessionAccepted?: () => void;
  onSessionPaused?: () => void;
  onSessionEnded?: () => void;
}

export function useChatSessionState({
  chatId,
  currentChatStatus,
  userRole = 'CLIENT',
  onBalanceWarning,
  onSessionAccepted,
  onSessionPaused,
  onSessionEnded,
}: UseChatSessionStateOptions) {
  const [state, dispatch] = useReducer(chatSessionReducer, {
    ...initialState,
    userRole,
  });
  
  // DEBUG: Track state changes
  useEffect(() => {
    console.log('[useChatSessionState] State updated:', {
      chatId: state.chatId,
      status: state.status,
      elapsedSeconds: state.elapsedSeconds,
      estimatedCost: state.estimatedCost,
      clientBalance: state.clientBalance,
      remainingSeconds: state.remainingSeconds,
      psychicRatePerSecond: state.psychicRatePerSecond,
    });
  }, [state]);
  
  const { onNotification } = useNotifications();
  const onBalanceWarningRef = useRef(onBalanceWarning);
  const onSessionAcceptedRef = useRef(onSessionAccepted);
  const onSessionPausedRef = useRef(onSessionPaused);
  const onSessionEndedRef = useRef(onSessionEnded);
  
  // Update refs
  useEffect(() => {
    onBalanceWarningRef.current = onBalanceWarning;
    onSessionAcceptedRef.current = onSessionAccepted;
    onSessionPausedRef.current = onSessionPaused;
    onSessionEndedRef.current = onSessionEnded;
  }, [onBalanceWarning, onSessionAccepted, onSessionPaused, onSessionEnded]);
  
  // Fetch initial session data from REST API when chatId changes
  useEffect(() => {
    if (!chatId || currentChatStatus !== 'ACTIVE') {
      return;
    }
    
    const fetchInitialData = async () => {
      try {
        console.log('[useChatSessionState] Fetching initial session data for chat:', chatId);
        const data = await getChatSessionTime(chatId);
        
        console.log('[useChatSessionState] Received initial data:', data);
        
        dispatch({
          type: 'INITIALIZE',
          payload: {
            chat_id: chatId,
            chat_status: 'ACTIVE',
            psychic_rate_per_second: data.price_per_second,
            client_balance: data.client_balance,
            credit_balance: data.credit_balance,
            paid_balance: data.paid_balance,
            elapsed_seconds: data.elapsed_seconds,
            estimated_cost: data.estimated_cost,
            // Honor the backend billing status so the meter stays frozen while
            // AWAITING_JOIN instead of ticking from accept.
            session_status: (data.session_status as any) ?? 'AWAITING_JOIN',
          }
        });
      } catch (error) {
        console.error('[useChatSessionState] Error fetching initial session data:', error);
      }
    };
    
    fetchInitialData();
  }, [chatId, currentChatStatus]);

  // Periodic re-sync (cockpit / non-client) — re-anchors the local meter to the
  // backend's JOIN-anchored session-time every few seconds. This is what fixes
  // the accrual drift: the meter no longer starts at accept and floats ahead of
  // the real billing. It also flips AWAITING_JOIN → ACTIVE the moment the client
  // joins, so "Waiting for client — not billing" clears on the real join.
  useEffect(() => {
    if (!chatId || userRole === 'CLIENT') {
      return;
    }
    // Only poll while the chat is live (accepted). Ended/requested chats don't
    // have a running session to re-anchor to.
    if (currentChatStatus !== 'ACTIVE') {
      return;
    }

    let cancelled = false;

    const sync = async () => {
      try {
        const data = await getChatSessionTime(chatId);
        if (cancelled) return;
        dispatch({
          type: 'SYNC',
          payload: {
            elapsed_seconds: data.elapsed_seconds,
            estimated_cost: data.estimated_cost,
            price_per_second: data.price_per_second,
            client_balance: data.client_balance,
            credit_balance: data.credit_balance,
            paid_balance: data.paid_balance,
            remaining_seconds: (data as any).remaining_seconds,
            session_status: (data.session_status as any) ?? 'AWAITING_JOIN',
          },
        });
      } catch (error) {
        console.error('[useChatSessionState] Periodic session-time sync failed:', error);
      }
    };

    // Immediate sync on entry, then every 8s to keep drift bounded while the
    // local 1s TICK animates the counter between syncs.
    sync();
    const interval = setInterval(sync, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chatId, currentChatStatus, userRole]);

  // Initialize paused state when loading a PAUSED chat
  useEffect(() => {
    if (chatId && currentChatStatus === 'PAUSED') {
      console.log('[useChatSessionState] Initializing paused state for chat:', chatId);
      dispatch({
        type: 'CHAT_PAUSED',
        payload: {
          reason: 'Session paused',
          elapsed_seconds: 0,
          estimated_cost: 0,
        }
      });
    }
  }, [chatId, currentChatStatus]);
  
  // Low balance warning callback
  useEffect(() => {
    if (state.showLowBalanceWarning && onBalanceWarningRef.current) {
      onBalanceWarningRef.current();
    }
  }, [state.showLowBalanceWarning]);
  
  // WebSocket notification handlers
  useEffect(() => {
    const unsubscribeAccepted = onNotification(
      NotificationType.CHAT_ACCEPTED,
      (notification) => {
        if (notification.data?.chat_id === chatId) {
          dispatch({ type: 'CHAT_ACCEPTED', payload: notification.data });
          onSessionAcceptedRef.current?.();
        }
      }
    );
    
    const unsubscribePaused = onNotification(
      NotificationType.CHAT_PAUSED,
      (notification) => {
        if (notification.data?.chat_id === chatId) {
          dispatch({ type: 'CHAT_PAUSED', payload: notification.data });
          onSessionPausedRef.current?.();
        }
      }
    );
    
    const unsubscribePausedInsufficientFunds = onNotification(
      NotificationType.CHAT_PAUSED_INSUFFICIENT_FUNDS,
      (notification) => {
        if (notification.data?.chat_id === chatId) {
          dispatch({ type: 'CHAT_PAUSED', payload: notification.data });
          onSessionPausedRef.current?.();
        }
      }
    );
    
    const unsubscribeResumed = onNotification(
      NotificationType.CHAT_RESUMED,
      (notification) => {
        if (notification.data?.chat_id === chatId) {
          dispatch({ type: 'CHAT_RESUMED', payload: notification.data });
        }
      }
    );
    
    const unsubscribeEnded = onNotification(
      NotificationType.CHAT_ENDED,
      (notification) => {
        if (notification.data?.chat_id === chatId) {
          dispatch({ 
            type: 'CHAT_ENDED',
            payload: {
              elapsed_seconds: notification.data?.elapsed_seconds,
              estimated_cost: notification.data?.estimated_cost,
              reason: notification.data?.reason,
            }
          });
          onSessionEndedRef.current?.();
        }
      }
    );
    
    return () => {
      unsubscribeAccepted();
      unsubscribePaused();
      unsubscribePausedInsufficientFunds();
      unsubscribeResumed();
      unsubscribeEnded();
    };
  }, [onNotification, chatId]);
  
  // Reset when chatId changes
  useEffect(() => {
    console.log('[useChatSessionState] chatId changed:', chatId);
    if (chatId === null) {
      console.log('[useChatSessionState] chatId is null, dispatching RESET');
      dispatch({ type: 'RESET' });
    }
  }, [chatId]);
  
  // Local 1-second countdown timer - runs independently between backend syncs.
  useEffect(() => {
    // Only run the meter once the client has actually joined (sessionStatus
    // ACTIVE). While AWAITING_JOIN the meter is frozen — nothing is billed yet.
    if (state.status !== 'ACTIVE' || state.isPaused || state.sessionStatus !== 'ACTIVE') {
      return;
    }

    // Stop timer if no remaining time
    if (state.remainingSeconds !== null && state.remainingSeconds <= 0) {
      console.log('[useChatSessionState] Timer stopped - no remaining time');
      return;
    }

    console.log('[useChatSessionState] Starting countdown timer');

    const timer = setInterval(() => {
      dispatch({ type: 'TICK' });
    }, 1000);

    return () => {
      console.log('[useChatSessionState] Stopping countdown timer');
      clearInterval(timer);
    };
  }, [state.status, state.isPaused, state.sessionStatus]); // Re-anchors when billing flips on join
  
  // Track if we've already called onSessionEnded to prevent multiple calls
  const hasCalledOnSessionEnded = useRef(false);
  
  // Reset when chatId changes
  useEffect(() => {
    hasCalledOnSessionEnded.current = false;
  }, [chatId]);
  
  // Handle auto-end when timer reaches 0
  useEffect(() => {
    if (state.status === 'ENDED' && state.remainingSeconds === 0 && !hasCalledOnSessionEnded.current) {
      console.log('[useChatSessionState] Session ended, reason:', state.endReason ?? 'unknown');
      hasCalledOnSessionEnded.current = true;
      onSessionEndedRef.current?.();
    }
  }, [state.status, state.remainingSeconds, state.endReason, chatId]);
  
  const updateBalance = useCallback((balance: number) => {
    dispatch({ type: 'UPDATE_BALANCE', payload: { balance } });
  }, []);
  
  return {
    sessionState: state,
    dispatch, // Expose dispatch for manual timer sync
    updateBalance,
    isActive: state.status === 'ACTIVE' && !state.isPaused,
    isPaused: state.isPaused,
    isEnded: state.status === 'ENDED',
  };
}

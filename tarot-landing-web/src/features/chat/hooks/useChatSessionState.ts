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
  remainingBalance: null,
  remainingSeconds: null,
  isInputEnabled: false,
  showLowBalanceWarning: false,
  showCriticalWarning: false,
  showEndingWarning: false,
  showCriticalEndingWarning: false,
  isPaused: false,
  pauseReason: null,
  userRole: 'CLIENT', // Default, can be passed as param
};

function chatSessionReducer(
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
        estimated_cost = 0
      } = action.payload;
      
      // Calculate remaining balance and time based on current session state
      const effectiveBalance = client_balance - estimated_cost;
      const remainingSeconds = psychic_rate_per_second > 0 
        ? Math.max(0, effectiveBalance / psychic_rate_per_second)
        : null;
      
      // If balance already depleted, immediately set to ENDED
      const actualStatus = (chat_status === 'ACTIVE' && remainingSeconds !== null && remainingSeconds <= 0) 
        ? 'ENDED' 
        : chat_status;
      
      const newState = {
        ...state,
        chatId: chat_id,
        status: actualStatus,
        psychicId: psychic_id,
        sessionStartedAt: session_started_at,
        psychicRatePerSecond: psychic_rate_per_second,
        clientBalance: client_balance,
        elapsedSeconds: elapsed_seconds,
        estimatedCost: estimated_cost,
        isInputEnabled: actualStatus === 'ACTIVE' && (remainingSeconds === null || remainingSeconds > 0),
        isPaused: false,
        remainingBalance: effectiveBalance,
        remainingSeconds,
        showLowBalanceWarning: remainingSeconds !== null && remainingSeconds > 60 && remainingSeconds <= 300,
        showCriticalWarning: remainingSeconds !== null && remainingSeconds <= 60,
      };
      
      console.log('[useChatSessionState] New state after INITIALIZE:', newState);
      console.log('[useChatSessionState] Balance check - effectiveBalance:', effectiveBalance, 'remainingSeconds:', remainingSeconds, 'actualStatus:', actualStatus);
      return newState;
    }
    
    case 'TICK': {
      if (state.isPaused || state.status !== 'ACTIVE') {
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
    
    // SYNC_TIMER removed - no longer syncing with backend
    
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
      
      return {
        ...state,
        clientBalance: newBalance,
        remainingBalance: newBalance - state.estimatedCost,
        remainingSeconds,
        showLowBalanceWarning: remainingSeconds !== null && remainingSeconds > 60 && remainingSeconds <= 300,
        showCriticalWarning: remainingSeconds !== null && remainingSeconds <= 60,
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
            elapsed_seconds: data.elapsed_seconds,
            estimated_cost: data.estimated_cost,
          }
        });
      } catch (error) {
        console.error('[useChatSessionState] Error fetching initial session data:', error);
      }
    };
    
    fetchInitialData();
  }, [chatId, currentChatStatus]);

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
  
  // Local 1-second countdown timer - runs independently
  useEffect(() => {
    // Only run timer if session is ACTIVE and not paused
    if (state.status !== 'ACTIVE' || state.isPaused) {
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
  }, [state.status, state.isPaused]); // Removed remainingSeconds from deps to prevent recreation
  
  // Track if we've already called onSessionEnded to prevent multiple calls
  const hasCalledOnSessionEnded = useRef(false);
  
  // Reset when chatId changes
  useEffect(() => {
    hasCalledOnSessionEnded.current = false;
  }, [chatId]);
  
  // Handle auto-end when timer reaches 0
  useEffect(() => {
    if (state.status === 'ENDED' && state.remainingSeconds === 0 && !hasCalledOnSessionEnded.current) {
      console.log('[useChatSessionState] Session auto-ended due to insufficient balance');
      hasCalledOnSessionEnded.current = true;
      onSessionEndedRef.current?.();
    }
  }, [state.status, state.remainingSeconds, chatId]);
  
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

import { useReducer, useEffect, useCallback, useRef } from 'react';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { NotificationType } from '@/features/notifications/types/notification.types';
import { ChatSessionState, ChatSessionAction, SessionStatus } from '../types/session.types';
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
  ratePerMinute: 0,
  minutesCharged: 0,
  remainingMinutes: 0,
  graceSecondsLeft: 0,
  graceReaderName: null,
  isToppingUp: false,
  reflectRemainingSeconds: null,
  reflectSecondsUsed: null,
  reflectingSince: null,
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
        session_status,
        credit_balance,
        paid_balance,
        rate_per_minute,
        remaining_minutes,
        minutes_charged,
        reflect_remaining_seconds,
        reflect_seconds_used,
        reflecting_since,
      } = action.payload;

      // Resolve the billing sub-state. The COCKPIT (psychic/admin) defaults to
      // AWAITING_JOIN so the meter stays frozen until a session-time sync
      // confirms the client joined. The CLIENT is, by virtue of viewing the
      // chat, already joined — never freeze their meter/input, so default ACTIVE.
      const resolvedSessionStatus: SessionStatus =
        session_status ?? (state.userRole === 'CLIENT' ? 'ACTIVE' : 'AWAITING_JOIN');

      const isBilling = resolvedSessionStatus === 'ACTIVE';
      const perMinute = rate_per_minute ?? (psychic_rate_per_second * 60);
      const remainingFromPayload = (action.payload as any).remaining_seconds;

      // Per-minute model: `client_balance` is the LIVE remaining balance (already
      // debited). NEVER subtract estimated_cost — that double-counts and, on a low
      // balance (e.g. 0.8 left after a £5.20 minute), yields a negative "remaining"
      // that falsely flips the session to ENDED. Remaining time = the current
      // prepaid minute still running + every further minute they can afford.
      const affordableFuture = perMinute > 0 ? Math.floor(client_balance / perMinute) : 0;
      const prepaidRemaining = Math.max(0, (minutes_charged ?? 0) * 60 - elapsed_seconds);
      const computedRemaining = prepaidRemaining + affordableFuture * 60;
      const remainingSeconds = remainingFromPayload != null ? remainingFromPayload : computedRemaining;
      const computedRemainingMinutes = affordableFuture + (prepaidRemaining > 0 ? 1 : 0);

      // The CLIENT never decides the session ended from its own balance math — the
      // backend drives grace → end and sends SESSION_ENDED. Just honor chat_status.
      const actualStatus = chat_status;

      const newState = {
        ...state,
        chatId: chat_id,
        status: actualStatus,
        sessionStatus: resolvedSessionStatus,
        psychicId: psychic_id,
        sessionStartedAt: session_started_at,
        psychicRatePerSecond: psychic_rate_per_second,
        clientBalance: client_balance,
        creditBalance: credit_balance ?? state.creditBalance,
        paidBalance: paid_balance ?? state.paidBalance,
        ratePerMinute: perMinute,
        minutesCharged: minutes_charged ?? 0,
        remainingMinutes: remaining_minutes ?? computedRemainingMinutes,
        elapsedSeconds: elapsed_seconds,
        estimatedCost: estimated_cost,
        isInputEnabled: actualStatus === 'ACTIVE' && isBilling,
        isPaused: false,
        remainingBalance: client_balance,
        remainingSeconds,
        // the server's reflection figures, when this payload carried them
        reflectRemainingSeconds: reflect_remaining_seconds ?? state.reflectRemainingSeconds,
        reflectSecondsUsed: reflect_seconds_used ?? state.reflectSecondsUsed,
        reflectingSince: reflecting_since !== undefined ? reflecting_since : state.reflectingSince,
        endReason: null,
        // Balance warnings only make sense once the meter is actually running.
        showLowBalanceWarning: isBilling && remainingSeconds !== null && remainingSeconds > 60 && remainingSeconds <= 300,
        showCriticalWarning: isBilling && remainingSeconds !== null && remainingSeconds <= 60,
      };

      return newState;
    }
    
    case 'TICK': {
      // Per-minute prepaid model: the TICK only animates the display between
      // backend syncs. It does NOT compute cost (cost = minutes charged × rate,
      // set by SYNC / minute-charged events) and does NOT auto-end — running out
      // triggers a backend GRACE pause, not a client-side end.
      if (state.isPaused || state.status !== 'ACTIVE' || state.sessionStatus !== 'ACTIVE') {
        return state;
      }

      const newElapsed = state.elapsedSeconds + 1;
      const remainingSeconds =
        state.remainingSeconds !== null ? Math.max(0, state.remainingSeconds - 1) : null;

      return {
        ...state,
        elapsedSeconds: newElapsed,
        remainingSeconds,
        showLowBalanceWarning: remainingSeconds !== null && remainingSeconds > 60 && remainingSeconds <= 300,
        showCriticalWarning: remainingSeconds !== null && remainingSeconds <= 60,
        showEndingWarning: remainingSeconds !== null && remainingSeconds > 10 && remainingSeconds <= 60,
        showCriticalEndingWarning: remainingSeconds !== null && remainingSeconds <= 10,
      };
    }

    case 'GRACE_TICK': {
      // Local 1s countdown for the out-of-balance top-up hold. When it hits 0
      // the backend ends the session (session_ended event does the rest).
      if (state.sessionStatus !== 'GRACE') {
        return state;
      }
      return {
        ...state,
        graceSecondsLeft: Math.max(0, state.graceSecondsLeft - 1),
      };
    }

    case 'SYNC': {
      // Re-anchor to the backend (poll every ~8s, plus the minute-charged and
      // grace events). Source of truth for balance / minutes / billing state.
      // NOTE: per-minute model NEVER auto-ends here — running out of balance is
      // a backend GRACE pause, and the real end arrives via session_ended.
      const incomingStatus = action.payload.session_status;
      // Ignore a stray sync that would un-pause a MANUAL pause; always honor a
      // grace update and never touch an already-ended session.
      if (
        state.status === 'ENDED' ||
        (state.isPaused && incomingStatus !== 'GRACE')
      ) {
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
        rate_per_minute,
        remaining_minutes,
        minutes_charged,
        grace_seconds_left,
        grace_reader_name,
        is_topping_up,
        reflect_remaining_seconds,
        reflect_seconds_used,
        reflecting_since,
      } = action.payload;

      const nextSessionStatus = session_status
        ?? state.sessionStatus
        ?? (state.userRole === 'CLIENT' ? 'ACTIVE' : 'AWAITING_JOIN');
      const rate = price_per_second ?? state.psychicRatePerSecond;
      const perMinute = rate_per_minute ?? state.ratePerMinute ?? rate * 60;

      const commonMoney = {
        psychicRatePerSecond: rate,
        ratePerMinute: perMinute,
        clientBalance: client_balance,
        creditBalance: credit_balance ?? state.creditBalance,
        paidBalance: paid_balance ?? state.paidBalance,
        estimatedCost: estimated_cost,
        minutesCharged: minutes_charged ?? state.minutesCharged,
        remainingMinutes: remaining_minutes ?? state.remainingMinutes,
        // the server's reflection figures, when this sync carried them
        reflectRemainingSeconds: reflect_remaining_seconds ?? state.reflectRemainingSeconds,
        reflectSecondsUsed: reflect_seconds_used ?? state.reflectSecondsUsed,
        reflectingSince: reflecting_since !== undefined ? reflecting_since : state.reflectingSince,
      };

      // ── Out-of-balance GRACE hold ─────────────────────────────────────────
      if (nextSessionStatus === 'GRACE') {
        return {
          ...state,
          ...commonMoney,
          sessionStatus: 'GRACE',
          status: 'PAUSED',
          isPaused: true,
          isInputEnabled: false,
          remainingBalance: client_balance,
          remainingSeconds: 0,
          graceSecondsLeft: grace_seconds_left ?? state.graceSecondsLeft ?? 60,
          graceReaderName: grace_reader_name ?? state.graceReaderName,
          isToppingUp: is_topping_up ?? state.isToppingUp,
          showLowBalanceWarning: false,
          showCriticalWarning: false,
          showEndingWarning: false,
          showCriticalEndingWarning: false,
        };
      }

      const isBilling = nextSessionStatus === 'ACTIVE';
      // client_balance is LIVE (already debited) — don't subtract estimated_cost
      // (double-count). Prefer the backend's remaining_seconds; else affordable.
      const remainingSeconds = remaining_seconds ?? (
        perMinute > 0
          ? Math.max(0, (minutes_charged ?? state.minutesCharged) * 60 - elapsed_seconds)
            + Math.floor(client_balance / perMinute) * 60
          : null
      );

      return {
        ...state,
        ...commonMoney,
        sessionStatus: nextSessionStatus,
        elapsedSeconds: elapsed_seconds,
        remainingBalance: client_balance,
        remainingSeconds,
        // Clear any lingering grace state on a healthy ACTIVE sync.
        graceSecondsLeft: 0,
        graceReaderName: null,
        isToppingUp: false,
        isInputEnabled: state.status === 'ACTIVE' && isBilling,
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
      
      // Per-minute model: cost = minutes charged × per-minute rate.
      const p = action.payload as any;
      const perMinute = p.rate_per_minute ?? state.ratePerMinute;
      const minutesCharged = p.minutes_charged ?? state.minutesCharged;
      const remainingMinutes = p.remaining_minutes ?? state.remainingMinutes;
      const estimatedCost =
        perMinute > 0 ? minutesCharged * perMinute
          : (elapsed_seconds ?? state.elapsedSeconds) * (rate_per_second ?? state.psychicRatePerSecond);

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
        ratePerMinute: perMinute,
        minutesCharged,
        remainingMinutes,
        // Clear the grace/top-up hold — we're billing again.
        graceSecondsLeft: 0,
        graceReaderName: null,
        isToppingUp: false,
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
            rate_per_minute: data.rate_per_minute,
            remaining_minutes: data.remaining_minutes,
            minutes_charged: data.minutes_charged,
            remaining_seconds: data.remaining_seconds,
            reflect_remaining_seconds: data.reflect_remaining_seconds,
            reflect_seconds_used: data.reflect_seconds_used,
            reflecting_since: data.reflecting_since,
            // Pass the backend billing status through (may be undefined). The
            // reducer applies the role-aware default (CLIENT → ACTIVE, cockpit →
            // AWAITING_JOIN) so the client is never frozen out of their own chat.
            session_status: data.session_status as any,
          } as any
        });
      } catch (error) {
        console.error('[useChatSessionState] Error fetching initial session data:', error);
      }
    };
    
    fetchInitialData();
  }, [chatId, currentChatStatus]);

  // Periodic re-sync — re-anchors the local meter to the backend's JOIN-anchored
  // session-time every few seconds. This is what fixes the accrual drift: the
  // meter no longer starts at accept and floats ahead of the real billing. On
  // the cockpit it also flips AWAITING_JOIN → ACTIVE the moment the client joins
  // ("Waiting for client — not billing" clears on the real join). On the CLIENT
  // it keeps the live balance / TIME LEFT anchored to backend truth across
  // sessions (fixes the stale "computed from full 15" balance) and feeds the
  // header its live Stardust total.
  useEffect(() => {
    if (!chatId) {
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
            remaining_seconds: data.remaining_seconds,
            // Pass through; the reducer role-defaults when absent.
            session_status: data.session_status as any,
            rate_per_minute: data.rate_per_minute,
            remaining_minutes: data.remaining_minutes,
            minutes_charged: data.minutes_charged,
            grace_seconds_left: data.grace_seconds_left,
            is_topping_up: data.is_topping_up,
            reflect_remaining_seconds: data.reflect_remaining_seconds,
            reflect_seconds_used: data.reflect_seconds_used,
            reflecting_since: data.reflecting_since,
          },
        });
        // Keep the global header Stardust total live during a client's reading.
        // getChatSessionTime.client_balance is the live credit+paid total.
        if (userRole === 'CLIENT' && typeof data.client_balance === 'number') {
          window.dispatchEvent(
            new CustomEvent('stardust:balance', { detail: data.client_balance })
          );
        }
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

  // Out-of-balance GRACE countdown — ticks the local top-up timer down each
  // second. When it reaches 0 the backend ends the session (session_ended).
  useEffect(() => {
    if (state.sessionStatus !== 'GRACE') {
      return;
    }
    const timer = setInterval(() => {
      dispatch({ type: 'GRACE_TICK' });
    }, 1000);
    return () => clearInterval(timer);
  }, [state.sessionStatus]);

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

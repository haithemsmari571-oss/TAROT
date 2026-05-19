import { useEffect, useRef } from "react";
import { useToast } from "@/components/Toast/useToast";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { NotificationType } from "@/features/notifications/types/notification.types";

const DEDUP_MS = 2000;

export const useChatEventToasts = (chatId: number | null, userRole: 'CLIENT' | 'PSYCHIC') => {
  const toast = useToast();
  const { onNotification } = useNotifications();
  const firedRef = useRef<Map<string, number>>(new Map());

  const fireOnce = (key: string, message: string, type: 'success' | 'error' | 'info' | 'warning') => {
    const now = Date.now();
    const last = firedRef.current.get(key);
    if (last && now - last < DEDUP_MS) return;
    firedRef.current.set(key, now);

    switch (type) {
      case 'success': toast.success(message); break;
      case 'error': toast.error(message); break;
      case 'info': toast.info(message); break;
      case 'warning': toast.warning(message); break;
    }
  };

  useEffect(() => {
    if (!chatId) return;

    const unsubs: (() => void)[] = [];

    unsubs.push(
      onNotification(NotificationType.CHAT_ENDED, (n) => {
        if (n.data?.chat_id !== chatId) return;
        const reason = n.data?.reason;
        if (reason === 'user_initiated' && userRole === 'PSYCHIC') return;
        const msg = reason === 'insufficient_balance'
          ? "Session ended — client's balance insufficient."
          : 'Chat session has ended.';
        fireOnce(`ended-${chatId}`, msg, 'info');
      })
    );

    unsubs.push(
      onNotification(NotificationType.CHAT_PAUSED, (n) => {
        if (n.data?.chat_id !== chatId) return;
        fireOnce(`paused-${chatId}`, 'Session paused. Top up your balance to continue.', 'info');
      })
    );

    unsubs.push(
      onNotification(NotificationType.CHAT_PAUSED_INSUFFICIENT_FUNDS, (n) => {
        if (n.data?.chat_id !== chatId) return;
        const msg = userRole === 'CLIENT'
          ? 'Chat paused due to insufficient balance. Please top up to continue.'
          : 'Client balance insufficient. Chat has been paused.';
        fireOnce(`paused-insufficient-${chatId}`, msg, 'warning');
      })
    );

    unsubs.push(
      onNotification(NotificationType.CHAT_RESUMED, (n) => {
        if (n.data?.chat_id !== chatId) return;
        fireOnce(`resumed-${chatId}`, 'Session resumed!', 'success');
      })
    );

    unsubs.push(
      onNotification(NotificationType.CHAT_ACCEPTED, (n) => {
        if (n.data?.chat_id !== chatId) return;
        if (userRole === 'CLIENT') {
          fireOnce(`accepted-${chatId}`, 'Chat accepted! Your session has started.', 'success');
        }
      })
    );

    return () => unsubs.forEach((u) => u());
  }, [chatId, userRole]);
};

import { useCallback, useEffect, useRef } from "react";
import { sendReaderTyping } from "../api/chatApi";

/**
 * Broadcasts the operator's typing state to the client as the reader's
 * "Valentina is typing…" indicator (the same typing_start/typing_stop events the AI
 * engines emit, which ClientChat already renders).
 *
 * Call ``onActivity()`` on every keystroke — a typing_start is sent at most once per
 * THROTTLE window, and a typing_stop fires automatically after IDLE_MS without
 * activity. Call ``stop()`` on send/discard so the indicator clears immediately.
 * Fire-and-forget: a failed signal never affects the operator's flow.
 */
const THROTTLE_MS = 2500;
const IDLE_MS = 4000;

export const useReaderTypingSignal = (chatId: number | null) => {
  const lastSentAt = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indicatorOn = useRef(false);

  const stop = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (indicatorOn.current && chatId) {
      indicatorOn.current = false;
      sendReaderTyping(chatId, false).catch(() => {});
    }
  }, [chatId]);

  const onActivity = useCallback(() => {
    if (!chatId) return;
    const now = Date.now();
    if (now - lastSentAt.current > THROTTLE_MS) {
      lastSentAt.current = now;
      indicatorOn.current = true;
      sendReaderTyping(chatId, true).catch(() => {});
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stop, IDLE_MS);
  }, [chatId, stop]);

  // Clear the indicator when the operator leaves the chat (or the component unmounts).
  useEffect(() => stop, [chatId, stop]);

  return { onActivity, stop };
};

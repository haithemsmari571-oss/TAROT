import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@iconify/react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { NotificationType } from "@/features/notifications/types/notification.types";
import { joinChat, getMyChatsWithDetails, getPsychicDetails } from "../api/chatApi";
import { paymentApi } from "@/features/payment/api/paymentApi";
import { useTopUp } from "@/features/payment/context/TopUpContext";
import { formatGbp } from "@/lib/currency";
import {
  isIncomingHeld, queueIncoming, isIncomingExpected,
} from "@/features/hall/incomingGate";
import "@/styles/incoming-gate.css";


interface Incoming {
  chatId: number;
  psychicName: string;
  psychicId?: number;
  photo?: string | null;
  perMinute?: number | null; // reader's £/min — for the affordability gate
}

/**
 * Global "Incoming Reading" gate (web equivalent of the mobile CallProvider).
 *
 * When a psychic ACCEPTS, the client sees this full-screen prompt over ANY page,
 * with the psychic's photo + name and a "Join" button. Billing / client_joined_at
 * is anchored ONLY by an explicit click on that button (`joinChat`) — never by
 * page navigation, auto-selection, or a background re-render. If she never clicks
 * Join, nothing bills, ever, no matter how long the chat sits accepted.
 *
 * The prompt is driven both by the real-time CHAT_ACCEPTED event AND by a
 * state check (any ACTIVE chat she hasn't joined) so it survives reloads and
 * can't be silently bypassed.
 */
export default function IncomingReadingModal() {
  const { user } = useAuth();
  const { onNotification } = useNotifications();
  const { open: openTopUp } = useTopUp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [joining, setJoining] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Chats already joined/dismissed THIS mount — stops the reload-proof fallback
  // from re-surfacing the prompt with stale data the instant after a join (the
  // flicker). A fresh CHAT_ACCEPTED clears the entry so a reused chat row (repeat
  // reading with the same psychic) still prompts next time.
  const handledRef = useRef<Set<number>>(new Set());
  // Lets a held prompt re-enter through the current showFor once released.
  const showForRef = useRef<((base: Incoming, ring: boolean) => void) | null>(null);

  const stopRing = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    stopRing();
    setIncoming((cur) => {
      // Remember it so the fallback query can't immediately pop it back up.
      if (cur) handledRef.current.add(cur.chatId);
      return null;
    });
  }, [stopRing]);

  const playRing = useCallback(() => {
    try {
      // Never stack rings: a duplicate accept signal (socket and status poll
      // racing) must not leave two loops playing over each other.
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      const a = new Audio("/sounds/request-alert.mp3");
      a.loop = true;
      a.volume = 0.6;
      audioRef.current = a;
      // Best-effort: browsers may block autoplay without a prior gesture; the
      // full-screen prompt is still unmissable if the sound is suppressed.
      a.play().catch(() => {});
    } catch {
      /* ignore audio failures */
    }
  }, []);

  // ── THE billing anchor ── shared verbatim by the JOIN button and the
  // requester's gateless arrival: mark handled, enter the room, then anchor
  // billing in the background. joinChat is idempotent server-side, so it
  // retries to survive a transient failure. One join path, not two.
  const anchorJoin = useCallback(
    async (chatId: number) => {
      handledRef.current.add(chatId);
      navigate(`/chats?chat_id=${chatId}`);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await joinChat(chatId);
          // Refresh the chats query so ClientChat sees the chat as ACTIVE and
          // initialises its session meter — otherwise the meter can sit frozen
          // at 0:00 and the reading looks stuck.
          queryClient.invalidateQueries({ queryKey: ["chats"] });
          break;
        } catch (e) {
          if (attempt === 2) {
            console.error("[IncomingReading] join failed after retries:", e);
          } else {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      }
    },
    [navigate, queryClient]
  );

  const showFor = useCallback(
    (base: Incoming, ring: boolean) => {
      // Don't re-surface a chat already joined/dismissed this session.
      if (handledRef.current.has(base.chatId)) return;
      // Inside the hall entry flow the prompt is held back for the length of the
      // hall's own arrival, then shown untouched (features/hall/incomingGate.ts).
      // Held, never cancelled — and Join is still the only thing that bills.
      if (isIncomingHeld()) {
        queueIncoming(() => showForRef.current?.(base, ring));
        return;
      }
      // The requester's own acceptance: she clicked Begin in this session, so
      // asking her to accept a second time is a step that should not exist.
      // Both arrival paths — the socket CHAT_ACCEPTED and the status poll's
      // synthetic one — land here through the same dispatch, so this one check
      // covers them both. Same join anchor, just not behind a second button.
      // An acceptance she is NOT waiting on still prompts below.
      if (isIncomingExpected(base.psychicId)) {
        void anchorJoin(base.chatId);
        return;
      }
      setIncoming((cur) => cur ?? base);
      if (ring) playRing();
      // Enrich with the psychic's real photo/name.
      if (base.psychicId) {
        getPsychicDetails(base.psychicId)
          .then((p) => {
            const perMin =
              p?.price_per_second != null
                ? Math.round(p.price_per_second * 60 * 100) / 100
                : null;
            setIncoming((cur) =>
              cur && cur.chatId === base.chatId
                ? {
                    ...cur,
                    photo: p?.profile_picture_url ?? cur.photo ?? null,
                    psychicName: p?.username || cur.psychicName,
                    perMinute: perMin ?? cur.perMinute ?? null,
                  }
                : cur
            );
          })
          .catch(() => {});
      }
    },
    [playRing, anchorJoin]
  );
  showForRef.current = showFor;

  // ── Real-time: psychic accepted (fires wherever she is on the site) ──
  useEffect(() => {
    if (!user) {
      clear();
      return;
    }
    const offAccepted = onNotification(NotificationType.CHAT_ACCEPTED, (n) => {
      const chatId = Number(n.data?.chat_id);
      if (!Number.isFinite(chatId)) return;
      // A fresh accept always (re)prompts — even for a reused chat row from an
      // earlier reading with the same psychic.
      handledRef.current.delete(chatId);
      showFor(
        {
          chatId,
          psychicName: (n.data?.psychic_name as string) || "Your psychic",
          psychicId: n.data?.psychic_id ? Number(n.data.psychic_id) : undefined,
          photo: null,
        },
        true
      );
    });

    const dismissIfSame = (n: { data?: any }) => {
      const chatId = Number(n.data?.chat_id);
      setIncoming((cur) => {
        if (cur && cur.chatId === chatId) {
          stopRing();
          return null;
        }
        return cur;
      });
    };
    const offEnded = onNotification(NotificationType.CHAT_ENDED, dismissIfSame);
    const offCancelled = onNotification(
      NotificationType.CHAT_REQUEST_CANCELLED,
      dismissIfSame
    );

    return () => {
      offAccepted();
      offEnded();
      offCancelled();
    };
  }, [user, onNotification, showFor, clear, stopRing]);

  // ── Reload-proof fallback: any ACTIVE chat she hasn't joined re-surfaces the
  //    prompt, so a refresh or missed event can't silently drop her past the gate.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyChatsWithDetails()
      .then((chats) => {
        if (cancelled) return;
        const pending = (chats || []).find(
          (c: any) =>
            c.user_id === user.id &&
            c.status === "ACTIVE" &&
            !c.client_joined_at
        );
        if (pending) {
          showFor(
            {
              chatId: pending.id,
              psychicName: pending.psychic_username || "Your psychic",
              psychicId: pending.psychic_id,
              photo: null,
            },
            false // no ring on a passive reload (autoplay would be blocked anyway)
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, showFor]);

  // Safety: stop the ring if this ever unmounts.
  useEffect(() => () => stopRing(), [stopRing]);

  // Escape dismisses the prompt, exactly like the Dismiss control — local
  // only, no server call, and the reload fallback can still re-surface it.
  useEffect(() => {
    if (!incoming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [incoming, clear]);

  // Load the client's live balance whenever a join prompt appears, so we can
  // gate Join on affordability (one full minute at the reader's rate).
  useEffect(() => {
    if (!incoming) return;
    let cancelled = false;
    paymentApi
      .getMyBalance()
      .then((b: any) => { if (!cancelled) setBalance(Number(b?.balance ?? 0)); })
      .catch(() => { if (!cancelled) setBalance(null); });
    return () => { cancelled = true; };
  }, [incoming?.chatId]);

  // Dev-only visual preview: any page + `?incoming=preview` shows the prompt with
  // mock data so the look can be eyeballed without a live accept. Remove before ship.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (new URLSearchParams(window.location.search).get("incoming") === "preview") {
      setIncoming({ chatId: -1, psychicName: "Selene Mare", photo: null });
    }
  }, []);

  const onJoin = useCallback(async () => {
    if (!incoming || joining) return;
    const id = incoming.chatId;
    setJoining(true);
    // Dismiss the prompt and enter immediately; anchorJoin (above) enters the
    // room and anchors billing in the background — the same anchor the
    // requester's gateless arrival uses.
    clear();
    await anchorJoin(id);
    setJoining(false);
  }, [incoming, joining, clear, anchorJoin]);

  if (!incoming) return null;

  // Block Join when the client can't cover even one minute at the reader's rate
  // (the first minute is charged upfront on join, so it would insta-die).
  const perMin = incoming.perMinute ?? null;
  const cantAffordJoin =
    perMin != null && perMin > 0 && balance != null && balance < perMin;

  /* The gate, in the hall's own language — src/styles/incoming-gate.css
     restates the hall's tokens as literal values because this can render over
     any page, where hall.css may not be loaded and html[data-hall] is unset. */
  return (
    <div className="incoming-gate" role="dialog" aria-modal="true" aria-label="Incoming reading">
      <div className="igate-panel">
        <div className="igate-orb">
          <div className="igate-aura" />
          <div className="igate-photo">
            {incoming.photo ? (
              <img src={incoming.photo} alt={incoming.psychicName} />
            ) : (
              <Icon icon="ph:sparkle-fill" className="igate-spark" />
            )}
          </div>
        </div>

        <p className="igate-eyebrow">Incoming reading</p>
        <h2 className="igate-name">{incoming.psychicName}</h2>
        <p className="igate-sub">is ready to begin your reading</p>

        {cantAffordJoin ? (
          <>
            <div className="igate-note">
              You need at least <b>{formatGbp(perMin!)}</b> for one minute with{" "}
              {incoming.psychicName}.
            </div>
            <button
              className="igate-join"
              onClick={() =>
                openTopUp({
                  returnUrl: `/chats?chat_id=${incoming.chatId}`,
                  reason: `Add Stardust to begin your reading with ${incoming.psychicName}.`,
                })
              }
            >
              Add Stardust
            </button>
          </>
        ) : (
          <button className="igate-join" onClick={onJoin} disabled={joining}>
            {joining ? "Joining…" : `Join ${incoming.psychicName}`}
          </button>
        )}

        <button className="igate-quiet" onClick={clear}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

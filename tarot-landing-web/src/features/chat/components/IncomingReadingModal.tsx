import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { NotificationType } from "@/features/notifications/types/notification.types";
import { joinChat, getMyChatsWithDetails, getPsychicDetails } from "../api/chatApi";
import { COLORS, TYPOGRAPHY } from "@/theme";

interface Incoming {
  chatId: number;
  psychicName: string;
  psychicId?: number;
  photo?: string | null;
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
  const navigate = useNavigate();

  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [joining, setJoining] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Chats already joined/dismissed THIS mount — stops the reload-proof fallback
  // from re-surfacing the prompt with stale data the instant after a join (the
  // flicker). A fresh CHAT_ACCEPTED clears the entry so a reused chat row (repeat
  // reading with the same psychic) still prompts next time.
  const handledRef = useRef<Set<number>>(new Set());

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

  const showFor = useCallback(
    (base: Incoming, ring: boolean) => {
      // Don't re-surface a chat already joined/dismissed this session.
      if (handledRef.current.has(base.chatId)) return;
      setIncoming((cur) => cur ?? base);
      if (ring) playRing();
      // Enrich with the psychic's real photo/name.
      if (base.psychicId) {
        getPsychicDetails(base.psychicId)
          .then((p) => {
            setIncoming((cur) =>
              cur && cur.chatId === base.chatId
                ? {
                    ...cur,
                    photo: p?.profile_picture_url ?? cur.photo ?? null,
                    psychicName: p?.username || cur.psychicName,
                  }
                : cur
            );
          })
          .catch(() => {});
      }
    },
    [playRing]
  );

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

    // ── THE ONLY billing trigger ── this explicit click. But don't hang the UI
    // on the network round-trip (which now also charges minute 1): dismiss the
    // prompt and enter the chat immediately, then anchor billing in the
    // background. joinChat stays click-driven (never navigation-driven) and is
    // idempotent server-side, so we retry to survive a transient failure.
    handledRef.current.add(id);
    clear();
    navigate(`/chats?chat_id=${id}`);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await joinChat(id);
        break;
      } catch (e) {
        if (attempt === 2) {
          console.error("[IncomingReading] join failed after retries:", e);
        } else {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
    setJoining(false);
  }, [incoming, joining, clear, navigate]);

  if (!incoming) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{
        backgroundColor: "rgba(5,5,8,0.92)",
        backdropFilter: "blur(10px)",
        fontFamily: TYPOGRAPHY.fontFamily.body,
      }}
    >
      <div
        className="w-full max-w-sm rounded-[28px] border p-8 text-center relative"
        style={{ backgroundColor: COLORS.surface, borderColor: `${COLORS.primary}44` }}
      >
        {/* Pulsing avatar */}
        <div className="relative mx-auto mb-6 w-28 h-28">
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{ backgroundColor: `${COLORS.primary}33` }}
          />
          <div
            className="relative w-28 h-28 rounded-full overflow-hidden border-2 flex items-center justify-center"
            style={{ borderColor: `${COLORS.primary}66`, backgroundColor: `${COLORS.primary}14` }}
          >
            {incoming.photo ? (
              <img
                src={incoming.photo}
                alt={incoming.psychicName}
                className="w-full h-full object-cover"
              />
            ) : (
              <Icon icon="ph:sparkle-fill" className="text-5xl" style={{ color: COLORS.primary }} />
            )}
          </div>
        </div>

        <div
          className="text-[11px] font-black uppercase tracking-[0.28em] mb-2"
          style={{ color: COLORS.starGold }}
        >
          Incoming Reading
        </div>
        <h2
          className="text-2xl font-black"
          style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }}
        >
          {incoming.psychicName}
        </h2>
        <p className="text-sm text-white/55 mt-1 mb-8">is ready to begin your reading</p>

        <button
          onClick={onJoin}
          disabled={joining}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black uppercase text-sm tracking-widest text-white transition-transform hover:scale-[1.02] disabled:opacity-60"
          style={{
            background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
            boxShadow: `0 12px 34px ${COLORS.primary}55`,
          }}
        >
          {joining ? (
            <>
              <Icon icon="svg-spinners:3-dots-fade" className="text-base" /> Joining…
            </>
          ) : (
            <>
              <Icon icon="solar:chat-round-dots-bold" className="text-lg" /> Join {incoming.psychicName}
            </>
          )}
        </button>

        <button
          onClick={clear}
          className="mt-4 text-sm font-semibold text-white/50 hover:text-white/80 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

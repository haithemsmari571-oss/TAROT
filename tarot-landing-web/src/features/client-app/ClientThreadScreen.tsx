/* The conversation screen: the hall's own room, inside the app shell.

   A container and nothing more. useThreadConnection is the engine (history,
   socket, sends, receipts, typing, rejection, live balance and price);
   HallRoom draws. The sky and the hall runtime already belong to the shell's
   backdrop stage, so this screen adds only what the backdrop leaves out: the
   room's document flag and the reader's orb. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/Toast/useToast";
import { useAuth } from "@/features/auth/hooks";
import { useBillingMode } from "@/features/billing-mode/BillingModeContext";
import { PER_MESSAGE_COPY, PER_MESSAGE_MAX_CHARS, REFUND_NOTE } from "@/features/chat/perMessage";
import HallRoom, { type HallRoomMessage } from "@/features/hall/HallRoom";
import { HallOrb } from "@/features/hall/HallStage";
import { useTopUp } from "@/features/payment/context/TopUpContext";
import axiosClient from "@/lib/axiosClient";
import { formatGbp } from "@/lib/currency";
import { readerName } from "./appReaders";
import { CHATS_PATH } from "./clientAppPaths";
import ConfirmEmailSheet, { CONFIRM_EMAIL_COPY, EMAIL_NOT_CONFIRMED } from "./ConfirmEmailSheet";
import { receiptOf, useThreadConnection } from "./useThreadConnection";
import { clockAt, dayOf } from "./ukTime";
import "./client-chats.css";
import "./client-thread.css";
import "./client-room.css";

interface ThreadDetails {
  id: number;
  psychic_id: number;
  billing_mode: string;
  price_per_message: number | null;
  balance: number;
  /** hours before an unanswered message is refunded (chats.py _billing_fields) */
  refund_after_hours: number;
}
interface ThreadReader {
  id: number;
  username: string;
  profile_picture_url: string | null;
  is_online: boolean;
  next_online_at: string | null;
}

/* The hall's own words. They are literals inside ClientChat.tsx (the composer
   placeholders) and HallRoom.tsx (the connecting note), which this work may not
   touch, so they are repeated here once, under the hall's name. */
const HALL_PLACEHOLDER = "Say anything…";
const HALL_PLACEHOLDER_CONNECTING = "Connecting...";
const HALL_CONNECTING_NOTE = "Connecting…";
/* The server's reasons for refusing a send, in the room's own lines. */
const INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE";
const REJECTION_COPY: Record<string, string> = {
  READER_UNAVAILABLE: PER_MESSAGE_COPY.readerUnavailable,
  SESSION_NOT_ACTIVE: PER_MESSAGE_COPY.sessionNotActive,
  [EMAIL_NOT_CONFIRMED]: CONFIRM_EMAIL_COPY.title,
};
const noProfileYet = () => {};

export default function ClientThreadScreen() {
  const { chatId: rawId } = useParams();
  const chatId = Number(rawId);
  const { billingMode, loaded } = useBillingMode();
  // Per-message unless the server says per-minute: a failed or unknown mode
  // keeps her in this room (BillingModeContext.tsx).
  const perMinute = billingMode === "per_minute";
  usePaymentReturn(chatId, loaded && !perMinute);
  if (!Number.isSafeInteger(chatId) || chatId <= 0) return <p role="alert">Chat not found.</p>;
  if (!loaded) return <RoomDocument><Waiting /></RoomDocument>;
  // The existing per-minute room remains the destination in that mode.
  if (perMinute) return <Navigate to={`/chats?chat_id=${chatId}`} replace />;
  return <RoomDocument><ThreadLoader key={chatId} chatId={chatId} /></RoomDocument>;
}

/* Back from Stripe Checkout: say so once, then leave a clean URL behind. A
   cancelled checkout only cleans the URL, with no toast. */
function usePaymentReturn(chatId: number, enabled: boolean) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const paid = enabled && params.get("status") === "success";
  const cancelled = enabled && params.get("status") === "cancelled";
  const told = useRef(false);
  useEffect(() => {
    if (cancelled) { navigate(`${CHATS_PATH}/${chatId}`, { replace: true }); return; }
    if (!paid) { told.current = false; return; }
    if (told.current) return;
    told.current = true;
    toast.success(PER_MESSAGE_COPY.paymentReceived);
    navigate(`${CHATS_PATH}/${chatId}`, { replace: true });
  }, [paid, cancelled, chatId, navigate, toast]);
}

/* hall-room.css is written for html[data-hall="room"], and the shell's backdrop
   leaves that flag unset on purpose. The conversation screen sets it for as
   long as it is mounted — in a layout effect, so the room never paints a frame
   without its styles — and takes it away again on the way out. */
function RoomDocument({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-hall", "room");
    return () => root.removeAttribute("data-hall");
  }, []);
  /* Arriving from the old hall in one commit, its stage drops the same flag in
     a passive cleanup, which runs after the layout effect above. Passive mount
     effects run after every passive cleanup, so this one has the last word. */
  useEffect(() => { document.documentElement.setAttribute("data-hall", "room"); }, []);
  return <>{children}</>;
}

function Waiting() {
  return <div className="client-room client-room-wait"><div className="rnote" role="status">{HALL_CONNECTING_NOTE}</div></div>;
}

function ThreadLoader({ chatId }: { chatId: number }) {
  const { user } = useAuth();
  const billing = useBillingMode();
  const details = useQuery({
    queryKey: ["client-thread-details", user?.id, chatId],
    queryFn: async ({ signal }) => (await axiosClient.get<ThreadDetails>(`/chat/${chatId}/details`, { signal })).data,
  });
  const reader = useQuery({
    queryKey: ["client-thread-reader", details.data?.psychic_id],
    enabled: !!details.data,
    queryFn: async ({ signal }) => (await axiosClient.get<ThreadReader>(`/psychic/${details.data!.psychic_id}`, { signal })).data,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  // Try again asks for the room's answers again, and the billing mode when
  // that is missing too, so a moment's failure is not a dead end.
  const tryAgain = () => {
    if (billing.failed) billing.retry();
    void details.refetch();
    if (details.data) void reader.refetch();
  };
  if (details.isError || reader.isError) return (
    <div className="client-room client-room-wait">
      <div className="client-chats-empty">
        <p role="alert">This chat could not be loaded.</p>
        <div className="client-chats-notice"><button type="button" onClick={tryAgain}>Try again</button></div>
        <Link to={CHATS_PATH}>Back to chats</Link>
      </div>
    </div>
  );
  if (!details.data || !reader.data) return <Waiting />;
  return <Room details={details.data} reader={reader.data} />;
}

function Room({ details, reader }: { details: ThreadDetails; reader: ThreadReader }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { open: openTopUp } = useTopUp();
  const chat = useThreadConnection(details.id, details.balance, details.price_per_message);
  const seat = useRef<HTMLDivElement>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [askedForStardust, setAskedForStardust] = useState(false);

  /* The orb over the profile button. The header's metrics are the hall's, so
     the button is measured rather than its numbers repeated; the centre goes
     down as two custom properties that client-room.css hands to .orbfix. */
  useLayoutEffect(() => {
    const host = seat.current;
    const who = host?.querySelector<HTMLElement>(".whobtn");
    const header = host?.querySelector<HTMLElement>(".top");
    if (!host || !who || !header) return;
    const place = () => {
      const box = who.getBoundingClientRect();
      host.style.setProperty("--client-room-orb-x", `${box.left + box.width / 2}px`);
      host.style.setProperty("--client-room-orb-y", `${box.top + box.height / 2}px`);
    };
    place();
    const watcher = new ResizeObserver(place);
    watcher.observe(header);
    window.addEventListener("resize", place);
    return () => { watcher.disconnect(); window.removeEventListener("resize", place); };
  }, []);

  const rows = useMemo(() => {
    // SYSTEM authorship labels the fixed opener, which still has the reader's
    // sender_id and is_system=false. It belongs in the thread as a reader bubble.
    // Of the system rows, only a refund's is hers to see: the room's quiet line.
    const messages = chat.messages.filter(message => !message.is_system || message.content === REFUND_NOTE);
    if (chat.pending) messages.push(chat.pending);
    const drawn: HallRoomMessage[] = [];
    let lastDay: string | null = null;
    for (const message of messages) {
      const date = dayOf(message.created_at);
      // one separator before the first message of each UK calendar day
      if (date !== lastDay) drawn.push({ id: `day-${date}`, mine: false, text: date, system: true });
      lastDay = date;
      drawn.push(message.is_system
        ? { id: message.id, mine: false, text: PER_MESSAGE_COPY.refund(readerName(reader)), system: true }
        : { id: message.id, mine: message.sender_id === user?.id, text: message.content, receipt: receiptOf(message.status) });
    }
    return drawn;
  }, [chat.messages, chat.pending, user?.id, reader]);

  const short = chat.price != null && chat.balance < chat.price;
  // the same glider /billing uses, in place, back to this room afterwards
  const offerStardust = useCallback(() => {
    openTopUp({
      reason: `Add Stardust to keep going with ${readerName(reader)}.${chat.price != null ? ` Each message is ${formatGbp(chat.price)}.` : ""}`,
      returnUrl: `${CHATS_PATH}/${details.id}?topup=1`,
    });
  }, [openTopUp, reader, chat.price, details.id]);
  const offer = useRef(offerStardust);
  useEffect(() => { offer.current = offerStardust; }, [offerStardust]);
  // the server refused a send for want of balance: her draft is back in the box
  useEffect(() => { if (chat.rejection === INSUFFICIENT_BALANCE) offer.current(); }, [chat.rejection]);
  // or until she confirms her email (her second message): the confirm sheet
  const [confirmEmail, setConfirmEmail] = useState(false);
  useEffect(() => { if (chat.rejection === EMAIL_NOT_CONFIRMED) setConfirmEmail(true); }, [chat.rejection]);

  const send = () => {
    if (!chat.draft.trim() || chat.pending || !chat.connected || chat.price == null) return;
    // Entering never asks. Pressing Send without the price does, and sends nothing.
    if (short) { setAskedForStardust(true); offerStardust(); return; }
    setAskedForStardust(false);
    chat.send();
  };
  const loadOlder = async () => {
    if (loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(false);
    try { await chat.loadOlder(); }
    catch { setOlderError(true); }
    finally { setLoadingOlder(false); }
  };

  /* One line under the composer. The Add Stardust line lives only while the
     balance is short of the price, so it clears the moment a top-up lands. */
  const refusal = short && (askedForStardust || chat.rejection === INSUFFICIENT_BALANCE)
    ? PER_MESSAGE_COPY.addStardust
    : chat.rejection && chat.rejection !== INSUFFICIENT_BALANCE ? REJECTION_COPY[chat.rejection] ?? chat.rejection : null;
  /* Until her first paid message in this conversation: the whole thread is
     loaded, nothing of hers is in it and nothing is on its way. Any refusal or
     error takes the line's place. */
  const beforeFirstMessage = !chat.loading && !chat.hasOlder && !chat.pending
    && !chat.messages.some(message => message.sender_id === user?.id);
  const promise = beforeFirstMessage && chat.price != null && typeof details.refund_after_hours === "number"
    ? PER_MESSAGE_COPY.refundPromise(chat.price, details.refund_after_hours)
    : null;
  const notice = refusal ?? chat.error ?? (olderError ? "Could not load older messages. Try again." : null) ?? promise;

  return (
    <div className="client-room" ref={seat}>
      <HallOrb />
      <HallRoom
        phase="room"
        readerName={readerName(reader)}
        readerPhoto={reader.profile_picture_url}
        minutesLeft={null}
        isPaused={false}
        elapsedLabel=""
        statusWord=""
        isConnected={chat.connected}
        messages={rows}
        loadingMessages={chat.loading}
        readerTyping={chat.thinking}
        hasMore={chat.hasOlder}
        loadingMore={loadingOlder}
        onLoadMore={loadOlder}
        keepPlaceOnOlder
        input={chat.draft}
        onInput={chat.setDraft}
        onSend={send}
        composerPlaceholder={chat.connected ? HALL_PLACEHOLDER : HALL_PLACEHOLDER_CONNECTING}
        composerDisabled={!chat.connected || chat.price == null}
        showComposer
        perMessage={{
          price: chat.price,
          balance: chat.balance,
          notice,
          maxChars: PER_MESSAGE_MAX_CHARS,
          sendPending: !!chat.pending,
          status: reader.is_online ? null : reader.next_online_at ? `back at ${clockAt(reader.next_online_at)}` : "offline",
        }}
        onBack={() => navigate(CHATS_PATH)}
        onOpenProfile={noProfileYet}
      />
      <ConfirmEmailSheet open={confirmEmail} onClose={() => setConfirmEmail(false)} />
    </div>
  );
}

import { Fragment, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks";
import { useBillingMode } from "@/features/billing-mode/BillingModeContext";
import { PER_MESSAGE_MAX_CHARS } from "@/features/chat/perMessage";
import axiosClient from "@/lib/axiosClient";
import { messageDate as instant, receiptOf, useThreadConnection, type Receipt } from "./useThreadConnection";
import "./client-thread.css";

interface ThreadDetails {
  id: number;
  psychic_id: number;
  billing_mode: string;
  price_per_message: number | null;
  balance: number;
}
interface ThreadReader {
  id: number;
  username: string;
  profile_picture_url: string | null;
  is_online: boolean;
  next_online_at: string | null;
}

// Older socket payloads use UTC without a suffix. Always display UK local time.
const time = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(instant(value));
const day = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" }).format(instant(value));
const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);

function Ticks({ state }: { state: Receipt }) {
  return (
    <svg className={`client-thread-ticks client-thread-ticks-${state}`} width="16" height="11" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={state}>
      <path d="m2 8 4 4L16 2" />
      {state !== "sent" && <path d="m10 11 2 2L22 3" />}
    </svg>
  );
}

export default function ClientThreadScreen() {
  const { chatId: rawId } = useParams();
  const chatId = Number(rawId);
  const { billingMode, loaded } = useBillingMode();
  if (!Number.isSafeInteger(chatId) || chatId <= 0) return <p role="alert">Chat not found.</p>;
  if (!loaded) return <p role="status">Loading chat…</p>;
  // The existing per-minute room remains the destination in that mode.
  if (billingMode !== "per_message") return <Navigate to={`/chats?chat_id=${chatId}`} replace />;
  return <ThreadLoader key={chatId} chatId={chatId} />;
}

function ThreadLoader({ chatId }: { chatId: number }) {
  const { user } = useAuth();
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
  if (details.isError || reader.isError) return <p className="client-thread-notice" role="alert">This chat could not be loaded. <Link to="/app/chats">Back to chats</Link></p>;
  if (!details.data || !reader.data) return <p className="client-thread-notice" role="status">Loading chat…</p>;
  return <Thread details={details.data} reader={reader.data} />;
}

function Thread({ details, reader }: { details: ThreadDetails; reader: ThreadReader }) {
  const { user } = useAuth();
  const chat = useThreadConnection(details.id, details.balance, details.price_per_message);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);
  // SYSTEM authorship labels the fixed opener, which still has the reader's
  // sender_id and is_system=false. It belongs in the thread as a reader bubble.
  const messages = chat.messages.filter(message => !message.is_system);
  if (chat.pending) messages.push(chat.pending);
  const lastClient = [...messages].reverse().find(message => message.sender_id === user?.id);

  useLayoutEffect(() => {
    if (stickToBottom.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages.length, chat.thinking, chat.loading]);

  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = "46px";
    if (chat.draft) element.style.height = `${Math.min(140, element.scrollHeight)}px`;
  }, [chat.draft]);

  const loadOlder = async () => {
    const element = scroller.current;
    if (!element || loadingOlder) return;
    const oldHeight = element.scrollHeight;
    const oldTop = element.scrollTop;
    stickToBottom.current = false;
    setLoadingOlder(true);
    setOlderError(false);
    try {
      await chat.loadOlder();
      requestAnimationFrame(() => { element.scrollTop = oldTop + element.scrollHeight - oldHeight; });
    } catch { setOlderError(true); }
    finally { setLoadingOlder(false); }
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    stickToBottom.current = true;
    chat.send();
  };

  return (
    <section className="client-thread" aria-label={`Chat with ${reader.username}`}>
      <header className="client-thread-header">
        <Link to="/app/chats" className="client-thread-back" aria-label="Back to chats">
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 5-7 7 7 7M7 12h14" /></svg>
        </Link>
        <span className="client-thread-avatar">
          {reader.profile_picture_url ? <img src={reader.profile_picture_url} alt="" /> : <span aria-hidden="true">{reader.username.slice(0, 1).toUpperCase()}</span>}
          <span className={`client-thread-online-dot${reader.is_online ? " is-online" : ""}`} />
        </span>
        <div className="client-thread-reader">
          <span className="client-thread-name">{reader.username}</span>
          <span className={`client-thread-availability${reader.is_online ? " is-online" : ""}`}>
            {reader.is_online ? "Online" : reader.next_online_at ? `Back at ${time(reader.next_online_at)}` : "Offline"}
          </span>
        </div>
      </header>

      <div className="client-thread-messages" ref={scroller} onScroll={() => {
        const element = scroller.current;
        if (element) stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
      }} aria-label="Messages">
        {chat.hasOlder && <button className="client-thread-older" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? "Loading…" : "Load older messages"}</button>}
        {olderError && <p role="alert">Could not load older messages. Try again.</p>}
        {chat.loading && <p className="client-thread-notice" role="status">Loading messages…</p>}
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const next = messages[index + 1];
          const mine = message.sender_id === user?.id;
          const date = day(message.created_at);
          const sameRun = previous?.sender_id === message.sender_id && day(previous.created_at) === date;
          const lastInRun = next?.sender_id !== message.sender_id || day(next.created_at) !== date;
          return (
            <Fragment key={message.id}>
              {(!previous || day(previous.created_at) !== date) && <div className="client-thread-date">{date}</div>}
              <div className={`client-thread-message${mine ? " mine" : " reader"}${sameRun ? " same-run" : ""}`} data-message-id={message.id}>
                <div className={`client-thread-bubble${lastInRun ? " tail" : ""}`}>{message.content}</div>
                {mine && message.id === lastClient?.id && <div className="client-thread-receipt" data-state={receiptOf(message.status)}>
                  <time dateTime={instant(message.created_at).toISOString()}>{time(message.created_at)}</time>
                  <Ticks state={receiptOf(message.status)} />
                </div>}
              </div>
            </Fragment>
          );
        })}
        {chat.thinking && <div className="client-thread-thinking" role="status" aria-label={`${reader.username} is thinking`}><span /><span /><span /></div>}
      </div>

      <form className="client-thread-composer" onSubmit={send}>
        <div className="client-thread-compose-row">
          <textarea ref={input} aria-label={`Message ${reader.username}`} placeholder={`Message ${reader.username}`} value={chat.draft} maxLength={PER_MESSAGE_MAX_CHARS} rows={1}
            onChange={event => chat.setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!chat.pending && chat.connected && chat.price != null) { stickToBottom.current = true; chat.send(); } } }} />
          <button className="client-thread-send" type="submit" aria-label="Send message" disabled={!chat.connected || !!chat.pending || !chat.draft.trim() || chat.price == null}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20V4m-7 7 7-7 7 7" /></svg>
          </button>
        </div>
        {chat.rejection && <p className="client-thread-error" role="alert">
          {chat.rejection === "INSUFFICIENT_BALANCE" ? <>Insufficient balance. <Link to="/billing">Top up</Link> to send your message.</> : "Your message could not be sent. Please try again."}
        </p>}
        {chat.error && <p className="client-thread-error" role="alert">{chat.error}</p>}
        {!chat.connected && !chat.error && <p className="client-thread-error" role="status">Connecting…</p>}
        <div className="client-thread-price">
          <span>{chat.price == null ? "Price unavailable" : `${money(chat.price)} per message`}</span>
          <span className="client-thread-price-dot" aria-hidden="true" />
          <span className="client-thread-balance">{money(chat.balance)} balance</span>
        </div>
      </form>
    </section>
  );
}

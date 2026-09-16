import { useEffect, useRef } from "react";
import { Link, Navigate } from "react-router-dom";
import { useBillingMode } from "@/features/billing-mode/BillingModeContext";
import { useClientInbox, type InboxConversation } from "./useClientInbox";
import "./client-chats.css";

const ukClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
const ukDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
const ukShortDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });
const calendarDay = (date: Date) => {
  const parts = ukDay.formatToParts(date);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
};

function activityTime(value: string, now: Date) {
  const date = new Date(value);
  const today = calendarDay(now);
  const messageDay = calendarDay(date);
  if (messageDay === today) return ukClock.format(date);
  // Subtract a calendar day, not 24 elapsed hours across a UK clock change.
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (messageDay === calendarDay(yesterday)) return "Yesterday";
  return ukShortDate.format(date);
}

function ConversationRow({ conversation, now }: { conversation: InboxConversation; now: Date }) {
  const { reader, last_message: last, unread_count: unread } = conversation;
  const state = conversation.client_last_message_state ?? "sent";
  return (
    <li>
      <Link to={`/app/chats/${conversation.chat_id}`} className={`client-chats-row${unread > 0 ? " has-unread" : ""}`} data-chat-id={conversation.chat_id}>
        <span className="client-chats-avatar">
          <span className="client-chats-initial" aria-hidden="true">{reader.display_name.slice(0, 1).toUpperCase()}</span>
          {reader.profile_picture_url && <img src={reader.profile_picture_url} alt="" onError={event => { event.currentTarget.hidden = true; }} />}
          <span className={`client-chats-online-dot${reader.is_online ? " is-online" : ""}`} aria-label={reader.is_online ? "Online" : "Offline"} />
        </span>
        <span className="client-chats-summary">
          <span className="client-chats-first-line">
            <span className="client-chats-name">{reader.display_name}</span>
            <time className="client-chats-time" dateTime={conversation.last_activity_at}>{activityTime(conversation.last_activity_at, now)}</time>
          </span>
          <span className="client-chats-preview-line">
            {last?.sent_by === "client" && <svg className={`client-chats-ticks ${state}`} width="17" height="12" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={state}>
              <path d="m2 8 4 4L16 2" />
              {state !== "sent" && <path d="m10 11 2 2L22 3" />}
            </svg>}
            <span className="client-chats-preview">{last?.text ?? ""}</span>
            {unread > 0 && <span className="client-chats-unread" aria-label={`${unread} unread messages`}>{unread}</span>}
          </span>
          {!reader.is_online && reader.next_online_at && <span className="client-chats-back">Back at {ukClock.format(new Date(reader.next_online_at))}</span>}
        </span>
      </Link>
    </li>
  );
}

export default function ClientChatsScreen() {
  const { billingMode, loaded } = useBillingMode();
  if (loaded && billingMode !== "per_message") return <Navigate to="/chats" replace />;
  return <ClientChatsList />;
}

function ClientChatsList() {
  const inbox = useClientInbox();
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = inbox;

  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasNextPage || isFetching || isFetchNextPageError) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void fetchNextPage();
    }, { root: scroller.current, rootMargin: "120px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetching, isFetchNextPageError, fetchNextPage]);

  // An offset page can overlap its neighbour if a reply arrives between fetches.
  // Keep each conversation once, with the newest page's copy, in server order.
  const unique = new Map<number, InboxConversation>();
  for (const page of inbox.data?.pages ?? []) {
    for (const item of page.items) if (!unique.has(item.chat_id)) unique.set(item.chat_id, item);
  }
  const conversations = [...unique.values()].sort((a, b) => Date.parse(b.last_activity_at) - Date.parse(a.last_activity_at) || b.chat_id - a.chat_id);
  const now = new Date();
  const empty = !!inbox.data && conversations.length === 0;

  return (
    <section className="client-chats" aria-label="Chats">
      <h1 className="client-chats-title">Chats</h1>
      <div className={`client-chats-scroll${empty ? " is-empty" : ""}`} ref={scroller}>
        {empty ? <div className="client-chats-empty">
          <p>No conversations yet</p>
          <Link to="/app/readers">Find a reader</Link>
        </div> : <>
          {inbox.isPending && <p className="client-chats-notice" role="status">Loading chats…</p>}
          {conversations.length > 0 && <ul className="client-chats-rows">{conversations.map(conversation => <ConversationRow key={conversation.chat_id} conversation={conversation} now={now} />)}</ul>}
          {inbox.isError && <p className="client-chats-notice" role="alert">Could not load chats. <button onClick={() => { void (isFetchNextPageError ? fetchNextPage() : inbox.refetch()); }}>Try again</button></p>}
          {inbox.isFetchingNextPage && <p className="client-chats-notice" role="status">Loading more chats…</p>}
          <div ref={sentinel} className="client-chats-sentinel" aria-hidden="true" />
        </>}
      </div>
    </section>
  );
}

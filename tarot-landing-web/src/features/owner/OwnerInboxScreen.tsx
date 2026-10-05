import { Link } from "react-router-dom";
import type { InboxItem } from "./ownerMessagesApi";
import { inboxRows, INBOX_REFRESH_MS, refundInLabel, sinceLabel, useNow, useOwnerInbox } from "./ownerMessages";
import { ModeChip, PullIndicator, ReaderPicture } from "./OwnerMessageParts";
import { OwnerBack } from "./OwnerParts";
import { ownerThreadPath } from "./ownerPaths";
import { usePullToRefresh } from "./usePullToRefresh";

const COPY = {
  heading: "Messages",
  loading: "Loading conversations…",
  failed: "The conversations could not be loaded.",
  tryAgain: "Try again",
  empty: "No conversations yet.",
  showMore: "Show more",
  loadingMore: "Loading…",
  you: "You: ",
  withReader: (reader: string) => `with ${reader}`,
  suggestionReady: "Suggestion ready",
  waiting: "Waiting",
} as const;

function Row({ item, now }: { item: InboxItem; now: number }) {
  const refund = item.waiting && !item.has_suggestion && item.refund_at ? refundInLabel(item.refund_at, now) : null;
  const status = item.has_suggestion ? COPY.suggestionReady : item.waiting ? COPY.waiting : null;
  const last = item.last_message_text ? `${item.last_sender === "reader" ? COPY.you : ""}${item.last_message_text}` : "";
  return (
    <li>
      <Link
        className="owner-inbox-row"
        to={ownerThreadPath(item.chat_id)}
        aria-label={[`${item.client_name} ${COPY.withReader(item.reader_name)}`, status, refund].filter(Boolean).join(". ")}
        data-owner-chat={item.chat_id}
      >
        <ReaderPicture url={item.reader_picture_url} name={item.reader_name} size="row" />
        <span className="owner-inbox-main">
          <span className="owner-inbox-names">
            <span className="owner-inbox-client">{item.client_name}</span>
            <span className="owner-inbox-reader"> · {COPY.withReader(item.reader_name)}</span>
          </span>
          <span className="owner-inbox-last">{last}</span>
          <ModeChip mode={item.mode} />
        </span>
        <span className="owner-inbox-side">
          <span className="owner-inbox-time">{sinceLabel(item.last_activity_at, now)}</span>
          {item.has_suggestion && <span className="owner-inbox-status is-suggestion">{COPY.suggestionReady}</span>}
          {!item.has_suggestion && item.waiting && <span className="owner-inbox-status is-waiting">{COPY.waiting}</span>}
          {refund && <span className="owner-inbox-refund">{refund}</span>}
        </span>
      </Link>
    </li>
  );
}

/* Messages (ROUND53): every conversation across every reader, in the
   server's order (a suggestion ready first, then her waiting, soonest refund
   first, then the newest). Twenty at a time with Show more; pull to refresh,
   and a refresh every 15 s while the screen is in view. */
export default function OwnerInboxScreen() {
  const inbox = useOwnerInbox();
  const now = useNow(INBOX_REFRESH_MS);
  const { pull, refreshing } = usePullToRefresh(() => inbox.refetch());
  const rows = inboxRows(inbox.data?.pages);

  return (
    <main className="owner-screen owner-inbox">
      <PullIndicator pull={pull} refreshing={refreshing} />
      <OwnerBack />
      <h1 className="owner-title">{COPY.heading}</h1>
      {inbox.isPending && <p className="owner-note" role="status">{COPY.loading}</p>}
      {inbox.isError && !inbox.data && (
        <div className="owner-posts-state">
          <p className="owner-error" role="alert">{COPY.failed}</p>
          <button type="button" className="owner-button-quiet" onClick={() => { void inbox.refetch(); }}>{COPY.tryAgain}</button>
        </div>
      )}
      {inbox.data && rows.length === 0 && <p className="owner-note">{COPY.empty}</p>}
      {rows.length > 0 && (
        <ul className="owner-panel owner-inbox-list">
          {rows.map((item) => <Row key={item.chat_id} item={item} now={now} />)}
        </ul>
      )}
      {inbox.hasNextPage && (
        <button
          type="button"
          className="owner-button-quiet"
          onClick={() => { void inbox.fetchNextPage(); }}
          disabled={inbox.isFetchingNextPage}
        >
          {inbox.isFetchingNextPage ? COPY.loadingMore : COPY.showMore}
        </button>
      )}
    </main>
  );
}

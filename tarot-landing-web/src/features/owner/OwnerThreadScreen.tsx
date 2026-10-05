import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  discardSuggestion,
  getThread,
  requestSuggestion,
  sendReply,
  setMode,
  type ConversationMode,
  type ThreadMessage,
} from "./ownerMessagesApi";
import {
  CHAT_IS_AUTOMATIC,
  mergeMessages,
  messageTimeLabel,
  MODE_LABEL,
  NOTHING_TO_ANSWER,
  OWNER_ATTENTION_QUERY_KEY,
  OWNER_INBOX_QUERY_KEY,
  ownerThreadQueryKey,
  refundClockLabel,
  refusalOf,
  THREAD_REFRESH_MS,
  useNow,
  useOwnerThread,
  useTypingSignal,
  WRITING_PATIENCE_MS,
  WRITING_REFRESH_MS,
  type ThreadView,
} from "./ownerMessages";
import { PullIndicator, ReaderPicture } from "./OwnerMessageParts";
import { OWNER_MESSAGES_PATH } from "./ownerPaths";
import { usePullToRefresh } from "./usePullToRefresh";

const COPY = {
  back: "Back to Messages",
  loading: "Loading…",
  failed: "This conversation could not be loaded.",
  tryAgain: "Try again",
  missing: "This conversation is not here.",
  withReader: (reader: string) => `with ${reader}`,
  modes: "Replies",
  earlier: "Earlier messages",
  loadingEarlier: "Loading…",
  earlierFailed: "Earlier messages could not be loaded. Try again.",
  newMessage: "New message",
  refunds: (when: string) => `Refunds at ${when} if not answered`,
  suggestion: "Suggestion",
  send: "Send",
  sending: "Sending…",
  newSuggestion: "New suggestion",
  discard: "Discard",
  writing: "Writing a suggestion…",
  slow: "Taking longer than usual. Pull to refresh.",
  writeAs: (reader: string) => `Write as ${reader}…`,
  getSuggestion: "Get a suggestion",
  automatic: "Replies go out on their own. Switch to Hybrid to step in.",
  confirm: "Replies to this client will go out on their own. Switch to Automatic?",
  confirmSwitch: "Switch",
  confirmCancel: "Cancel",
  notSent: "It did not send. Try again.",
  notSwitched: "It did not switch. Try again.",
  notDiscarded: "It did not discard. Try again.",
  notAsked: "A new suggestion could not be asked for. Try again.",
  nothingToAnswer: "Nothing is waiting for a reply.",
  nowAutomatic: "This conversation is on Automatic now.",
} as const;

const MODES: ConversationMode[] = ["hybrid", "automatic"];
const NO_MESSAGES: ThreadMessage[] = [];
/* Within this of the end of the page counts as at the bottom. */
const BOTTOM_SLACK_PX = 96;
const isAtBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - BOTTOM_SLACK_PX;
const toBottom = (behavior: ScrollBehavior) => window.scrollTo({ top: document.documentElement.scrollHeight, behavior });

type Busy = "send" | "discard" | "ask" | "mode" | null;

function BackArrow() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

function Message({ message, now }: { message: ThreadMessage; now: number }) {
  if (message.side === "system") {
    return <li className="owner-msg is-system" data-owner-message={message.id}><p>{message.text}</p></li>;
  }
  return (
    <li className={`owner-msg is-${message.side}`} data-owner-message={message.id}>
      <p className="owner-bubble">{message.text}</p>
      <time className="owner-msg-time" dateTime={message.created_at}>{messageTimeLabel(message.created_at, now)}</time>
    </li>
  );
}

/* A reply box in Inter at 16px that grows with its text. */
function ReplyBox({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={box}
      className="owner-input owner-reply-box"
      aria-label={label}
      rows={2}
      value={value}
      placeholder={placeholder}
      autoCapitalize="sentences"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/* One conversation (ROUND53): her messages on the left and the reader's on
   the right, the Hybrid | Automatic switch, and at the bottom, in normal flow
   so the phone's keyboard never covers it, the Suggestion to edit and send, or
   a box to write as the reader. Refreshed every 5 s while in view, every 2 s
   for up to a minute while a suggestion is being written. */
export default function OwnerThreadScreen() {
  const { chatId: chatParam } = useParams();
  const chatId = Number(chatParam);
  const queryClient = useQueryClient();
  const key = ownerThreadQueryKey(chatId);
  const sheetId = useId();
  const now = useNow(THREAD_REFRESH_MS);
  const typing = useTypingSignal(chatId);

  // A New suggestion or Get a suggestion asked for, until a different one arrives.
  const [awaiting, setAwaiting] = useState<{ from: number | null } | null>(null);
  // Each stretch of "Writing a suggestion…" is counted, so a minute's patience is per stretch.
  const [stretch, setStretch] = useState({ writing: false, count: 0 });
  const [slowStretch, setSlowStretch] = useState(-1);
  const slow = stretch.writing && slowStretch === stretch.count;

  const thread = useOwnerThread(chatId, queryClient, (view) => {
    const writing = !!view && view.mode === "hybrid" && (view.suggestion_generating || awaiting !== null);
    return writing && !slow ? WRITING_REFRESH_MS : THREAD_REFRESH_MS;
  });
  const view = thread.data;
  const hybrid = view?.mode === "hybrid";
  const suggestion = view?.suggestion ?? null;

  // A different suggestion arrived, or the conversation left Hybrid: nothing is awaited.
  if (awaiting && view && (!hybrid || (suggestion && suggestion.id !== awaiting.from))) setAwaiting(null);
  const writing = !!view && hybrid && (view.suggestion_generating || awaiting !== null);
  if (writing !== stretch.writing) setStretch({ writing, count: stretch.count + 1 });
  useEffect(() => {
    if (!stretch.writing) return;
    const count = stretch.count;
    const timer = window.setTimeout(() => setSlowStretch(count), WRITING_PATIENCE_MS);
    return () => window.clearTimeout(timer);
  }, [stretch]);

  const [edit, setEdit] = useState<{ id: number; text: string } | null>(null);
  const suggestionText = suggestion ? (edit?.id === suggestion.id ? edit.text : suggestion.text) : "";
  const [ownText, setOwnText] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [line, setLine] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [earlier, setEarlier] = useState<"idle" | "busy" | "failed">("idle");

  const { pull, refreshing } = usePullToRefresh(() => thread.refetch());

  /* ── Keeping to the bottom ── */
  const messages = view?.messages ?? NO_MESSAGES;
  const newestId = messages.length ? messages[messages.length - 1].id : null;
  const atBottom = useRef(true);
  const shownNewest = useRef<number | null>(null);
  const stickToBottom = useRef(false);
  const [pill, setPill] = useState(false);
  useEffect(() => {
    const note = () => {
      atBottom.current = isAtBottom();
      if (atBottom.current) setPill(false);
    };
    window.addEventListener("scroll", note, { passive: true });
    window.addEventListener("resize", note);
    return () => {
      window.removeEventListener("scroll", note);
      window.removeEventListener("resize", note);
    };
  }, []);
  useLayoutEffect(() => {
    if (newestId === null || newestId === shownNewest.current) return;
    const first = shownNewest.current === null;
    shownNewest.current = newestId;
    if (first || atBottom.current || stickToBottom.current) {
      stickToBottom.current = false;
      toBottom(first ? "auto" : "smooth");
    } else {
      setPill(true);
    }
  }, [newestId]);
  // A suggestion or the writing line appearing below keeps him at the bottom when he was there.
  const bottomState = `${view?.mode}:${suggestion?.id ?? ""}:${writing}`;
  useLayoutEffect(() => {
    if (shownNewest.current !== null && atBottom.current) toBottom("auto");
  }, [bottomState]);

  /* "Earlier messages" keeps the oldest message he could see where it was. */
  const anchor = useRef<{ id: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const held = anchor.current;
    if (!held) return;
    anchor.current = null;
    const element = document.querySelector(`[data-owner-message="${held.id}"]`);
    if (element) window.scrollBy(0, element.getBoundingClientRect().top - held.top);
  }, [messages]);
  const loadEarlier = async () => {
    const oldest = messages[0];
    if (!oldest) return;
    const element = document.querySelector(`[data-owner-message="${oldest.id}"]`);
    setEarlier("busy");
    try {
      const page = await getThread(chatId, oldest.id);
      anchor.current = element ? { id: oldest.id, top: element.getBoundingClientRect().top } : null;
      queryClient.setQueryData<ThreadView>(key, (current) => current && ({
        ...current,
        messages: mergeMessages(current.messages, page.messages),
        olderToLoad: page.has_more,
      }));
      setEarlier("idle");
    } catch {
      setEarlier("failed");
    }
  };

  /* ── What he does ── */
  const patchView = async (change: (current: ThreadView) => ThreadView) => {
    // A refresh in flight would put back what was true before.
    await queryClient.cancelQueries({ queryKey: key });
    queryClient.setQueryData<ThreadView>(key, (current) => current && change(current));
  };
  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: OWNER_INBOX_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: OWNER_ATTENTION_QUERY_KEY });
  };

  const send = async (content: string) => {
    const text = content.trim();
    if (!text || busy) return;
    setBusy("send");
    setLine(null);
    try {
      const sent = await sendReply(chatId, text);
      stickToBottom.current = true;
      await patchView((current) => {
        const unanswered = current.unanswered_message_ids.filter((id) => !sent.closed_as_answered.includes(id));
        return {
          ...current,
          suggestion: null,
          waiting: false,
          unanswered_message_ids: unanswered,
          oldest_unanswered_at: unanswered.length ? current.oldest_unanswered_at : null,
          refund_at: unanswered.length ? current.refund_at : null,
          messages: mergeMessages(current.messages, [
            { id: sent.message_id, side: "reader", text, created_at: new Date().toISOString(), status: null },
          ]),
        };
      });
      setOwnText("");
      setEdit(null);
      setAwaiting(null);
    } catch (error) {
      setLine(refusalOf(error) === CHAT_IS_AUTOMATIC ? COPY.nowAutomatic : COPY.notSent);
    } finally {
      typing.stop();
      setBusy(null);
      settle();
    }
  };

  const discard = async () => {
    if (busy) return;
    setBusy("discard");
    setLine(null);
    try {
      await discardSuggestion(chatId);
    } catch (error) {
      // Already gone is what was wanted.
      if (refusalOf(error) !== "NO_SUGGESTION") {
        setLine(COPY.notDiscarded);
        setBusy(null);
        return;
      }
    }
    await patchView((current) => ({ ...current, suggestion: null }));
    setEdit(null);
    setAwaiting(null);
    setBusy(null);
    settle();
  };

  const ask = async () => {
    if (busy) return;
    const from = suggestion?.id ?? null;
    setBusy("ask");
    setLine(null);
    try {
      await requestSuggestion(chatId);
      setAwaiting({ from });
    } catch (error) {
      const refusal = refusalOf(error);
      setLine(refusal === NOTHING_TO_ANSWER ? COPY.nothingToAnswer : refusal === CHAT_IS_AUTOMATIC ? COPY.nowAutomatic : COPY.notAsked);
    } finally {
      setBusy(null);
      settle();
    }
  };

  const switchMode = async (mode: ConversationMode) => {
    if (busy) return;
    typing.stop();
    setBusy("mode");
    setLine(null);
    try {
      const nowMode = await setMode(chatId, mode);
      await patchView((current) => ({ ...current, mode: nowMode, ...(nowMode === "automatic" ? { suggestion: null } : {}) }));
      setConfirming(false);
      setAwaiting(null);
      setEdit(null);
    } catch {
      setLine(COPY.notSwitched);
    } finally {
      setBusy(null);
      settle();
    }
  };
  const chooseMode = (mode: ConversationMode) => {
    if (!view || mode === view.mode || busy) return;
    if (mode === "automatic") {
      setLine(null);
      setConfirming(true);
    } else {
      void switchMode(mode);
    }
  };
  const closeSheet = () => {
    if (busy === "mode") return;
    setConfirming(false);
    setLine(null);
  };
  const onSheetKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") closeSheet();
  };

  /* ── The page ── */
  const header = (
    <header className="owner-thread-head">
      <Link className="owner-thread-back" to={OWNER_MESSAGES_PATH} aria-label={COPY.back}>
        <BackArrow />
      </Link>
      {view && (
        <>
          <span className="owner-thread-names">
            <span className="owner-thread-client">{view.client_name}</span>
            <span className="owner-thread-reader">{COPY.withReader(view.reader_name)}</span>
          </span>
          <ReaderPicture url={view.reader_picture_url} name={view.reader_name} size="head" />
        </>
      )}
    </header>
  );

  if (!view) {
    const missing = refusalOf(thread.error) === "Chat not found";
    return (
      <main className="owner-screen owner-thread">
        {header}
        {thread.isPending && thread.fetchStatus !== "idle" && <p className="owner-note" role="status">{COPY.loading}</p>}
        {(thread.isError || (thread.isPending && thread.fetchStatus === "idle")) && (
          <div className="owner-posts-state">
            <p className="owner-error" role="alert">{missing || !Number.isInteger(chatId) ? COPY.missing : COPY.failed}</p>
            {!missing && Number.isInteger(chatId) && (
              <button type="button" className="owner-button-quiet" onClick={() => { void thread.refetch(); }}>{COPY.tryAgain}</button>
            )}
          </div>
        )}
      </main>
    );
  }

  const canAsk = view.unanswered_message_ids.length > 0;
  let bottom;
  if (!hybrid) {
    bottom = <p className="owner-quiet owner-thread-automatic">{COPY.automatic}</p>;
  } else if (writing && !slow) {
    bottom = (
      <section className="owner-panel owner-composer" data-owner-bottom="writing">
        <p className="owner-writing" role="status">{COPY.writing}</p>
      </section>
    );
  } else if (suggestion) {
    bottom = (
      <section className="owner-panel owner-composer" aria-labelledby={`${sheetId}-suggestion`} data-owner-bottom="suggestion">
        {slow && <p className="owner-note" role="status">{COPY.slow}</p>}
        <h2 className="owner-composer-title" id={`${sheetId}-suggestion`}>{COPY.suggestion}</h2>
        <ReplyBox
          label={COPY.suggestion}
          value={suggestionText}
          disabled={busy !== null}
          onChange={(text) => {
            setEdit({ id: suggestion.id, text });
            typing.typed();
          }}
        />
        {line && <p className="owner-error" role="alert">{line}</p>}
        <button type="button" className="owner-button" onClick={() => { void send(suggestionText); }} disabled={busy !== null || !suggestionText.trim()}>
          {busy === "send" ? COPY.sending : COPY.send}
        </button>
        <div className="owner-composer-row">
          <button type="button" className="owner-button-quiet" onClick={() => { void ask(); }} disabled={busy !== null}>{COPY.newSuggestion}</button>
          <button type="button" className="owner-button-quiet owner-button-faint" onClick={() => { void discard(); }} disabled={busy !== null}>{COPY.discard}</button>
        </div>
      </section>
    );
  } else {
    bottom = (
      <section className="owner-panel owner-composer" data-owner-bottom="write">
        {slow && <p className="owner-note" role="status">{COPY.slow}</p>}
        <ReplyBox
          label={COPY.writeAs(view.reader_name)}
          placeholder={COPY.writeAs(view.reader_name)}
          value={ownText}
          disabled={busy !== null}
          onChange={(text) => {
            setOwnText(text);
            typing.typed();
          }}
        />
        {line && <p className="owner-error" role="alert">{line}</p>}
        <button type="button" className="owner-button" onClick={() => { void send(ownText); }} disabled={busy !== null || !ownText.trim()}>
          {busy === "send" ? COPY.sending : COPY.send}
        </button>
        {canAsk && (
          <button type="button" className="owner-button-quiet" onClick={() => { void ask(); }} disabled={busy !== null}>{COPY.getSuggestion}</button>
        )}
      </section>
    );
  }

  return (
    <main className="owner-screen owner-thread">
      {header}
      {/* Under the header, which stays on top of the page. */}
      <PullIndicator pull={pull} refreshing={refreshing} />
      <div className="owner-mode-switch" role="radiogroup" aria-label={COPY.modes}>
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={view.mode === mode}
            className="owner-mode-option"
            onClick={() => chooseMode(mode)}
            disabled={busy === "mode"}
          >
            {MODE_LABEL[mode]}
          </button>
        ))}
      </div>
      {!hybrid && line && !confirming && <p className="owner-error" role="alert">{line}</p>}
      {view.olderToLoad && (
        <button type="button" className="owner-button-quiet owner-earlier" onClick={() => { void loadEarlier(); }} disabled={earlier === "busy"}>
          {earlier === "busy" ? COPY.loadingEarlier : COPY.earlier}
        </button>
      )}
      {earlier === "failed" && <p className="owner-error" role="alert">{COPY.earlierFailed}</p>}
      <ol className="owner-thread-messages">
        {messages.map((message) => <Message key={message.id} message={message} now={now} />)}
      </ol>
      {pill && (
        <button
          type="button"
          className="owner-new-message"
          onClick={() => {
            setPill(false);
            toBottom("smooth");
          }}
        >
          {COPY.newMessage}
        </button>
      )}
      {view.refund_at && <p className="owner-quiet owner-refund-line">{COPY.refunds(refundClockLabel(view.refund_at, now))}</p>}
      {bottom}
      {confirming && (
        <div className="owner-sheet-backdrop" onClick={closeSheet}>
          <section
            className="owner-panel owner-sheet"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${sheetId}-sheet`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onSheetKey}
          >
            <p className="owner-sheet-line" id={`${sheetId}-sheet`}>{COPY.confirm}</p>
            {line && <p className="owner-error" role="alert">{line}</p>}
            <button type="button" className="owner-button" onClick={() => { void switchMode("automatic"); }} disabled={busy === "mode"}>
              {COPY.confirmSwitch}
            </button>
            <button type="button" className="owner-button-quiet" onClick={closeSheet} disabled={busy === "mode"} autoFocus>
              {COPY.confirmCancel}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

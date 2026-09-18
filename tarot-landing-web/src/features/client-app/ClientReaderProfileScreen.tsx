/* The reader's profile: the hall's request panel with one button, Message.
   It opens the per-message conversation with this reader, or finds the one
   she already has, and lands her in the room with the reader's opener already
   there and nothing charged. Her first paid message is the room's send. */
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { usePsychicDetails } from "@/features/browse/hooks/usePsychicDetails";
import type { Psychic } from "@/features/browse/types/psychic.types";
import { PER_MESSAGE_COPY } from "@/features/chat/perMessage";
import axiosClient from "@/lib/axiosClient";
import { sanitizeClaims } from "@/lib/copy";
import { formatGbp, WELCOME_CREDIT_GBP } from "@/lib/currency";
import { READERS_PATH } from "./ClientReadersScreen";
import { clockAt } from "./ukTime";
import "./client-chats.css";
import "./client-readers.css";

/** POST /chat/conversation: the fields the profile reads from its answer. */
interface ConversationOpened { chat_id: number; created: boolean }

export default function ClientReaderProfileScreen() {
  const { psychicId: rawId } = useParams();
  const id = Number(rawId);
  const valid = Number.isSafeInteger(id) && id > 0;
  const reader = usePsychicDetails(valid ? id : undefined);
  if (!valid || reader.isError) return (
    <Column>
      <div className="client-chats-empty">
        <p role="alert">This reader could not be loaded.</p>
        <Link to={READERS_PATH}>Back to readers</Link>
      </div>
    </Column>
  );
  if (!reader.data) return <Column><p className="client-chats-notice" role="status">Loading…</p></Column>;
  return <Column><Profile reader={reader.data} /></Column>;
}

/* The screen's own column: the way back at the top left, then whatever the
   profile has to show, centred. */
function Column({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <section className="client-reader-profile" aria-label="Reader profile">
      <div className="client-reader-profile-top">
        <button type="button" className="client-reader-back" aria-label="Back to readers" onClick={() => navigate(READERS_PATH)}>‹</button>
      </div>
      {children}
    </section>
  );
}

function Profile({ reader }: { reader: Psychic }) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  // Serif names read as names, not labels: Title case whatever the DB holds,
  // exactly as the card does (PsychicCard.tsx:33).
  const name = reader.username ? reader.username.charAt(0).toUpperCase() + reader.username.slice(1).toLowerCase() : "";
  // The card's own rule (PsychicCard.tsx:23): no price, no price line.
  const price = reader.price_per_message != null && reader.price_per_message > 0 ? reader.price_per_message : null;
  const status = reader.is_online ? "Online now" : reader.next_online_at ? `Back at ${clockAt(reader.next_online_at)}` : "Offline";
  const categories = reader.categories ?? [];

  const message = async () => {
    if (opening) return;
    setRefusal(null);
    setOpening(true);
    try {
      const { data } = await axiosClient.post<ConversationOpened>("/chat/conversation", { psychic_id: reader.id });
      navigate(`/app/chats/${data.chat_id}`);
    } catch (error) {
      setRefusal(isAxiosError(error) && error.response?.status === 402 ? PER_MESSAGE_COPY.readerUnavailable : PER_MESSAGE_COPY.openFailed);
      setOpening(false);
    }
  };

  return (
    <article className="panel" aria-label={name}>
      <span className="client-reader-photo">
        <span className="client-reader-photo-disc">
          <span className="client-reader-initial" aria-hidden="true">{name.slice(0, 1)}</span>
          {reader.profile_picture_url && <img src={reader.profile_picture_url} alt="" onError={event => { event.currentTarget.hidden = true; }} />}
        </span>
        <span className={`client-chats-online-dot${reader.is_online ? " is-online" : ""}`} aria-label={reader.is_online ? "Online" : "Offline"} />
      </span>
      <p className="eyebrow">{status}</p>
      <h1 className="ptitle">{name}</h1>
      <p className="psub">{sanitizeClaims(reader.bio)}</p>
      {categories.length > 0 && <div className="pills">{categories.map(category => <span key={category.id} className="pill">{category.title}</span>)}</div>}
      {price != null && <>
        <p className="client-reader-price">{formatGbp(price)} <span>per message</span></p>
        <p className="client-reader-gift">{formatGbp(WELCOME_CREDIT_GBP)} free · {Math.floor(WELCOME_CREDIT_GBP / price)} messages</p>
      </>}
      <button type="button" className="begin" onClick={message} disabled={opening} aria-busy={opening}>Message</button>
      {refusal && <p className="client-reader-refusal" role="alert">{refusal}</p>}
    </article>
  );
}

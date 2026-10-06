/* The reader's profile: the hall's request panel with one button, Message.
   It opens the per-message conversation with this reader, or finds the one
   she already has, and lands her in the room with the reader's opener already
   there and nothing charged. Her first paid message is the room's send. The
   heart in the panel's corner marks the reader as a favourite. Under her
   name, her profile (ReaderFacts.tsx). Under the panel, her approved
   reviews (ClientReaderReviews.tsx). */
import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { usePsychicDetails } from "@/features/browse/hooks/usePsychicDetails";
import type { Psychic } from "@/features/browse/types/psychic.types";
import { PER_MESSAGE_COPY } from "@/features/chat/perMessage";
import { GUIDANCE_LINE, sanitizeClaims } from "@/lib/copy";
import { formatGbp } from "@/lib/currency";
import { presenceLine, readerName } from "./appReaders";
import { READERS_PATH } from "./clientAppPaths";
import ClientReaderReviews from "./ClientReaderReviews";
import FavouriteHeart from "./FavouriteHeart";
import { openConversation, threadPath } from "./readerIntent";
import ReaderFacts from "./ReaderFacts";
import { hasWelcomeCredit, useGiftCredit, useRefundAfterHours, welcomeCreditLine } from "./useWelcomeCredit";
import "./client-chats.css";
import "./client-readers.css";
import "./client-favourites.css";

const BACK_TO_READERS = "Back to readers";

export default function ClientReaderProfileScreen() {
  const { psychicId: rawId } = useParams();
  const id = Number(rawId);
  const valid = Number.isSafeInteger(id) && id > 0;
  const reader = usePsychicDetails(valid ? id : undefined);
  if (!valid || reader.isError) return (
    <Column>
      <div className="client-chats-empty">
        <p role="alert">This reader could not be loaded.</p>
        <Link to={READERS_PATH}>{BACK_TO_READERS}</Link>
      </div>
    </Column>
  );
  if (!reader.data) return <Column><p className="client-chats-notice" role="status">Loading…</p></Column>;
  // A reader the owner has hidden takes no new conversation (the server
  // refuses one with 410); a thread she already has stays in her Chats.
  if (reader.data.is_listed === false) return (
    <Column>
      <div className="client-chats-empty">
        <p role="status">{PER_MESSAGE_COPY.readerGone}</p>
        <Link to={READERS_PATH}>{BACK_TO_READERS}</Link>
      </div>
    </Column>
  );
  return <Column><Profile reader={reader.data} /><ClientReaderReviews reader={reader.data} /></Column>;
}

/* The screen's own column: the way back at the top left, then whatever the
   profile has to show, centred. Back steps back through history, so the
   Readers tab returns with its search, filters and page still in the URL
   (the reading screen's rule, ClientArticleScreen.tsx); a profile opened
   straight from a link has nothing behind it in the app and goes to the
   roster. */
function Column({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { key } = useLocation();
  const back = () => (key === "default" ? navigate(READERS_PATH) : navigate(-1));
  return (
    <section className="client-reader-profile" aria-label="Reader profile">
      <div className="client-reader-profile-top">
        <button type="button" className="client-reader-back" aria-label={BACK_TO_READERS} onClick={back}>‹</button>
      </div>
      {children}
    </section>
  );
}

function Profile({ reader }: { reader: Psychic }) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const welcomeCreditGbp = useGiftCredit();
  const refundAfterHours = useRefundAfterHours();

  const name = readerName(reader);
  // The card's own rule (PsychicCard.tsx:23): no price, no price line.
  const price = reader.price_per_message != null && reader.price_per_message > 0 ? reader.price_per_message : null;
  const status = presenceLine(reader);
  const categories = reader.categories ?? [];

  const message = async () => {
    if (opening) return;
    setRefusal(null);
    setOpening(true);
    try {
      const opened = await openConversation(reader.id);
      navigate(threadPath(opened.chat_id));
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      setRefusal(status === 410 ? PER_MESSAGE_COPY.readerGone
        : status === 402 ? PER_MESSAGE_COPY.readerUnavailable : PER_MESSAGE_COPY.openFailed);
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
      <FavouriteHeart readerId={reader.id} name={name} className="client-reader-heart" />
      <p className="eyebrow">{status}</p>
      <h1 className="ptitle">{name}</h1>
      <ReaderFacts reader={reader} />
      <p className="psub">{sanitizeClaims(reader.bio)}</p>
      {categories.length > 0 && <div className="pills">{categories.map(category => <span key={category.id} className="pill">{category.title}</span>)}</div>}
      {price != null && <>
        <p className="client-reader-price">{formatGbp(price)} <span>per message</span></p>
        {refundAfterHours !== undefined && <p className="client-reader-promise">{PER_MESSAGE_COPY.refundPromise(price, refundAfterHours)}</p>}
        {hasWelcomeCredit(welcomeCreditGbp) && <p className="client-reader-gift">{welcomeCreditLine(welcomeCreditGbp, price)}</p>}
      </>}
      <button type="button" className="begin" onClick={message} disabled={opening} aria-busy={opening}>Message</button>
      {refusal && <p className="client-reader-refusal" role="alert">{refusal}</p>}
      <p className="legal">{GUIDANCE_LINE}</p>
    </article>
  );
}

import { Link } from "react-router-dom";
import { ReaderPicture } from "./OwnerMessageParts";
import { OwnerBack } from "./OwnerParts";
import { OWNER_NEW_READER_PATH, ownerReaderPath } from "./ownerPaths";
import { priceLine, useOwnerReaders } from "./ownerReaders";

const COPY = {
  title: "Readers",
  add: "Add reader",
  loading: "Loading readers…",
  failed: "The readers could not be loaded.",
  tryAgain: "Try again",
  empty: "No readers yet.",
  hidden: "Hidden",
} as const;

/* Every reader (ROUND54), hidden ones too, in the site's order: her photo, her
   name, her price, and Hidden when clients cannot see her. Add reader on top. */
export default function OwnerReadersScreen() {
  const readers = useOwnerReaders();

  return (
    <main className="owner-screen owner-readers">
      <OwnerBack />
      <h1 className="owner-title">{COPY.title}</h1>
      <Link className="owner-button owner-new-post" to={OWNER_NEW_READER_PATH}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {COPY.add}
      </Link>
      {readers.isPending && <p className="owner-note" role="status">{COPY.loading}</p>}
      {readers.isError && (
        <div className="owner-posts-state">
          <p className="owner-error" role="alert">{COPY.failed}</p>
          <button type="button" className="owner-button-quiet" onClick={() => { void readers.refetch(); }}>{COPY.tryAgain}</button>
        </div>
      )}
      {readers.data?.items.length === 0 && <p className="owner-note">{COPY.empty}</p>}
      {readers.data && readers.data.items.length > 0 && (
        <ul className="owner-panel owner-reader-list">
          {readers.data.items.map((reader) => (
            <li key={reader.id}>
              <Link
                className="owner-reader-row"
                to={ownerReaderPath(reader.id)}
                aria-label={`${reader.name}, ${priceLine(reader.price_per_message)}${reader.is_listed ? "" : `, ${COPY.hidden}`}`}
                data-owner-reader={reader.id}
              >
                <ReaderPicture url={reader.picture_url} name={reader.name} size="row" />
                <span className="owner-reader-main">
                  <span className="owner-reader-name">{reader.name}</span>
                  <span className="owner-reader-price">{priceLine(reader.price_per_message)}</span>
                </span>
                {!reader.is_listed && <span className="owner-badge owner-badge-hidden">{COPY.hidden}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

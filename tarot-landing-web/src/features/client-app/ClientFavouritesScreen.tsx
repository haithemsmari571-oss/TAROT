/* Favourites under You: the readers she has marked, each leading to its
   profile, with the heart at the end to remove. The ids come from
   useFavourites, the readers from the roster the Readers tab loads. A removed
   row leaves at once, so the screen keeps the line that says so, in the You
   tab's own notice line. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { pickReaders, presenceLine, ReaderDisc, readerName, useAppReaders } from "./appReaders";
import { AccountFrame } from "./ClientAccountForm";
import { READERS_PATH } from "./clientAppPaths";
import FavouriteHeart from "./FavouriteHeart";
import { useFavourites } from "./useFavourites";
import "./client-favourites.css";

const COPY = {
  title: "Favourites",
  empty: "You have not marked any readers as favourites yet.",
  browse: "Browse readers",
  loading: "Loading…",
  failed: "Could not load your favourites.",
  retry: "Try again",
} as const;

export default function ClientFavouritesScreen() {
  const favourites = useFavourites();
  const readers = useAppReaders();
  const rows = pickReaders(favourites.ids, readers.data?.items);
  const failed = favourites.failed || readers.isError;
  const loading = !failed && (!favourites.ready || readers.isPending);
  const [said, setSaid] = useState("");

  return (
    <AccountFrame title={COPY.title}>
      <p className="client-you-notice" role="status">{said}</p>
      {failed && (
        <p className="client-chats-notice" role="alert">
          {COPY.failed} <button onClick={() => { void favourites.retry(); void readers.refetch(); }}>{COPY.retry}</button>
        </p>
      )}
      {loading && <p className="client-chats-notice" role="status">{COPY.loading}</p>}
      {!failed && !loading && rows.length === 0 && (
        <div className="client-chats-empty">
          <p>{COPY.empty}</p>
          <Link to={READERS_PATH}>{COPY.browse}</Link>
        </div>
      )}
      {rows.length > 0 && (
        <ul className="client-favs-rows">
          {rows.map(reader => {
            const name = readerName(reader);
            return (
              <li key={reader.id} className="client-favs-row">
                <Link to={`${READERS_PATH}/${reader.id}`} className="client-favs-row-link">
                  <ReaderDisc reader={reader} />
                  <span className="client-chats-summary">
                    <span className="client-chats-name">{name}</span>
                    <span className="client-chats-back">{presenceLine(reader)}</span>
                  </span>
                </Link>
                <FavouriteHeart readerId={reader.id} name={name} onSaid={setSaid} />
              </li>
            );
          })}
        </ul>
      )}
    </AccountFrame>
  );
}

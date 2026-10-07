/* Favourites under You: the readers she has marked, each leading to its
   profile, then the reels she has liked (ROUND71), the newest like first, each
   opening the Shorts tab at that reel; the heart at the end of every row
   removes it. The reader ids come from useFavourites, the readers from the
   roster the Readers tab loads, the reels from useReelLikes. A removed row
   leaves at once, so the screen keeps the line that says so, in the You tab's
   own notice line. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { resolveLibraryMediaUrl } from "@/features/sanctuary/api/libraryItemsApi";
import { pickReaders, presenceLine, ReaderDisc, readerName, useAppReaders } from "./appReaders";
import { AccountFrame } from "./ClientAccountForm";
import { READERS_PATH, shortsAtReel } from "./clientAppPaths";
import FavouriteHeart from "./FavouriteHeart";
import ReelHeart from "./ReelHeart";
import { useFavourites } from "./useFavourites";
import { useReelLikes } from "./useReelLikes";
import "./client-favourites.css";

const COPY = {
  title: "Favourites",
  readers: "Readers",
  empty: "You have not marked any readers as favourites yet.",
  browse: "Browse readers",
  reels: "Reels",
  noReels: "Tap the heart on a reel to keep it here.",
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
  const likes = useReelLikes();
  const [said, setSaid] = useState("");

  return (
    <AccountFrame title={COPY.title}>
      <p className="client-you-notice" role="status">{said}</p>
      <section className="client-you-section" aria-label={COPY.readers}>
        <p className="client-chats-eyebrow">{COPY.readers}</p>
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
      </section>

      <section className="client-you-section" aria-label={COPY.reels}>
        <p className="client-chats-eyebrow">{COPY.reels}</p>
        {likes.failed && (
          <p className="client-chats-notice" role="alert">
            {COPY.failed} <button onClick={() => { void likes.retry(); }}>{COPY.retry}</button>
          </p>
        )}
        {!likes.failed && !likes.ready && <p className="client-chats-notice" role="status">{COPY.loading}</p>}
        {likes.ready && likes.reels.length === 0 && (
          <div className="client-chats-empty">
            <p>{COPY.noReels}</p>
          </div>
        )}
        {likes.reels.length > 0 && (
          <ul className="client-favs-rows">
            {likes.reels.map(reel => {
              const poster = resolveLibraryMediaUrl(reel.cover_url);
              return (
                <li key={reel.key} className="client-favs-row">
                  <Link to={shortsAtReel(reel.key)} className="client-favs-row-link">
                    <span className="client-favs-reel-poster">{poster && <img src={poster} alt="" loading="lazy" />}</span>
                    <span className="client-chats-summary">
                      <span className="client-chats-name client-favs-reel-title">{reel.title}</span>
                    </span>
                  </Link>
                  <ReelHeart reel={reel} onSaid={setSaid} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AccountFrame>
  );
}

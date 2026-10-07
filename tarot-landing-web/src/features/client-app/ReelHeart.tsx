/* The heart on a reel (ROUND71): on every reel in the Shorts tab and at the end
   of each reel on the Favourites screen. The readers' heart (FavouriteHeart.tsx)
   in look and words, with the reel's title for the name. The mark changes at
   once and is put back, with the site's small error, if the server refuses
   (useReelLikes). */
import { useState, type MouseEvent } from "react";
import type { ReelItem } from "@/features/sanctuary/api/libraryItemsApi";
import { FAVOURITE_COPY, HeartButton } from "./FavouriteHeart";
import { useReelLikes } from "./useReelLikes";

interface ReelHeartProps {
  reel: ReelItem;
  className?: string;
  /** Given, the screen announces the outcome and the heart renders no status line of its own. */
  onSaid?: (text: string) => void;
}

export default function ReelHeart({ reel, className, onSaid }: ReelHeartProps) {
  const { isLiked, set } = useReelLikes();
  const on = isLiked(reel.key);
  const [said, setSaid] = useState("");

  const press = async (event: MouseEvent<HTMLButtonElement>) => {
    // The reel behind pauses on a tap; the heart takes its own.
    event.stopPropagation();
    const next = !on;
    const agreed = await set(reel, next);
    (onSaid ?? setSaid)(agreed ? (next ? FAVOURITE_COPY.added(reel.title) : FAVOURITE_COPY.removed(reel.title)) : FAVOURITE_COPY.failed);
  };

  return (
    <>
      <HeartButton on={on} label={on ? FAVOURITE_COPY.remove(reel.title) : FAVOURITE_COPY.add(reel.title)} className={className} onClick={press} />
      {!onSaid && <span className="client-fav-said" role="status">{said}</span>}
    </>
  );
}

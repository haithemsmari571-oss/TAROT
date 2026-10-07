/* The heart: one control on the reader card, the reader profile and the
   Favourites list. Its name says the reader and what a press does, and a
   status line says what happened: the heart's own hidden one, or the screen's
   when the screen hands one over (the Favourites list, where a removed row
   takes its heart with it). The mark changes at once and is put back if the
   server refuses (useFavourites). */
import { useState, type MouseEvent } from "react";
import { useFavourites } from "./useFavourites";
import "./client-favourites.css";

export const FAVOURITE_COPY = {
  add: (name: string) => `Add ${name} to your favourites`,
  remove: (name: string) => `Remove ${name} from your favourites`,
  added: (name: string) => `${name} added to your favourites.`,
  removed: (name: string) => `${name} removed from your favourites.`,
  failed: "Could not update your favourites. Please try again.",
} as const;

interface HeartProps {
  readerId: number;
  name: string;
  className?: string;
  /** Given, the screen announces the outcome and the heart renders no status line of its own. */
  onSaid?: (text: string) => void;
}

export default function FavouriteHeart({ readerId, name, className, onSaid }: HeartProps) {
  const { isFavourite, set } = useFavourites();
  const on = isFavourite(readerId);
  const [said, setSaid] = useState("");

  const press = async () => {
    const next = !on;
    const agreed = await set(readerId, next);
    (onSaid ?? setSaid)(agreed ? (next ? FAVOURITE_COPY.added(name) : FAVOURITE_COPY.removed(name)) : FAVOURITE_COPY.failed);
  };

  return (
    <>
      <HeartButton on={on} label={on ? FAVOURITE_COPY.remove(name) : FAVOURITE_COPY.add(name)} className={className} onClick={press} />
      {!onSaid && <span className="client-fav-said" role="status">{said}</span>}
    </>
  );
}

/** The heart's mark, filled when on; also the reels' double-tap burst. */
export function HeartGlyph({ on }: { on: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

/** The heart button, lit when on: the readers' heart above and the reels' (ReelHeart.tsx). */
export function HeartButton({ on, label, className, onClick }: { on: boolean; label: string; className?: string; onClick: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      className={`client-fav-heart${on ? " is-on" : ""}${className ? ` ${className}` : ""}`}
      aria-label={label}
      onClick={onClick}
    >
      <HeartGlyph on={on} />
    </button>
  );
}

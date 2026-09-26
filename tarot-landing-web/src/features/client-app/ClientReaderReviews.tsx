/* The reader's reviews on her profile (ROUND15 section 2). The average of her
   approved reviews and how many there are, then the reviews, newest first,
   each writer by her first letter only (the server sends "S.").
   A client whose paid message this reader has answered is invited to leave
   one (can_review, GET /psychic/{id}). A new or edited review waits for the
   owner's approval; meanwhile only she sees it, with where it stands, and
   she may change or delete it. With no approved review and nothing of hers,
   the section draws only the invitation, and without that, nothing. */
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { reviewsApi } from "@/features/browse/api/reviewsApi";
import { useMyReviews, usePsychicReviewSummary, usePsychicReviews } from "@/features/browse/hooks/usePsychicDetails";
import type { Psychic } from "@/features/browse/types/psychic.types";
import type { Review, ReviewStatus } from "@/features/browse/types/review.types";
import { litStars, REVIEW_STARS, starsLabel } from "@/lib/reviewStars";
import { refusalText } from "./ClientAccountForm";
import { dayOf } from "./ukTime";
import "./client-readers.css";
import "./client-you.css";

/** The words' limit, as TAROT-BACKEND app/schemas/review.py takes it (comment up to 1000). The stars are lib/reviewStars.ts. */
export const REVIEW_MAX_CHARS = 1000;
/** Approved reviews per page: shown at first, and added by each Show more. */
const REVIEWS_PAGE_SIZE = 5;

export const REVIEW_COPY = {
  heading: "Reviews",
  count: (n: number) => (n === 1 ? "1 review" : `${n} reviews`),
  average: (value: number, n: number) => `${value.toFixed(1)} out of ${REVIEW_STARS} stars, ${n === 1 ? "1 review" : `${n} reviews`}`,
  invite: "Leave a review",
  yours: "Your review",
  stars: "Your stars",
  starsValue: starsLabel,
  words: "Your words (optional)",
  wordsHint: "What was your reading like?",
  send: "Send review",
  save: "Save",
  cancel: "Cancel",
  edit: "Edit",
  remove: "Delete",
  more: "Show more",
  standing: {
    pending: "Waiting for approval. Only you can see it for now.",
    approved: "On her page.",
    hidden: "Not shown on her page.",
  } satisfies Record<ReviewStatus, string>,
} as const;

function Stars({ value, label }: { value: number; label: string }) {
  const lit = litStars(value);
  return (
    <span className="client-reader-review-stars" role="img" aria-label={label}>
      {"★".repeat(lit)}<span className="is-off">{"★".repeat(REVIEW_STARS - lit)}</span>
    </span>
  );
}

export default function ClientReaderReviews({ reader }: { reader: Psychic }) {
  const queryClient = useQueryClient();
  const summary = usePsychicReviewSummary(reader.id);
  const mine = useMyReviews();
  const [pages, setPages] = useState(1);
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!summary.data || !mine.data) return null;
  const total = summary.data.total_reviews;
  const own = mine.data.find(review => review.psychic_id === reader.id);
  const invited = reader.can_review === true && !own;
  if (total === 0 && !own && !invited) return null;

  // What a review changes: her own list, the reader's list and average, and
  // can_review on the reader (GET /psychic/{id}).
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["my-reviews"] }),
    queryClient.invalidateQueries({ queryKey: ["psychic-review-summary", reader.id] }),
    queryClient.invalidateQueries({ queryKey: ["psychic-reviews", reader.id] }),
    queryClient.invalidateQueries({ queryKey: ["psychic", reader.id] }),
  ]);

  const remove = async (review: Review) => {
    if (removing) return;
    setError(null);
    setRemoving(true);
    try {
      await reviewsApi.deleteReview(review.id);
      await refresh();
    } catch (failure) {
      setError(refusalText(failure));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className="client-reader-reviews" aria-label={REVIEW_COPY.heading}>
      {total > 0 && (
        <header className="client-reader-reviews-head">
          <h2 className="client-reader-reviews-title">{REVIEW_COPY.heading}</h2>
          <p className="client-reader-reviews-summary">
            <Stars value={summary.data.average_rating} label={REVIEW_COPY.average(summary.data.average_rating, total)} />
            <span className="client-reader-reviews-average" aria-hidden="true">{summary.data.average_rating.toFixed(1)}</span>
            <span aria-hidden="true">· {REVIEW_COPY.count(total)}</span>
          </p>
        </header>
      )}

      {own && (
        <article className="client-you-card" aria-label={REVIEW_COPY.yours}>
          <p className="client-you-label">{REVIEW_COPY.yours}</p>
          {editing ? (
            <ReviewForm readerId={reader.id} review={own} onDone={async () => { await refresh(); setEditing(false); }} onCancel={() => setEditing(false)} />
          ) : (
            <>
              <div className="client-reader-review-own">
                <Stars value={own.rating} label={REVIEW_COPY.starsValue(own.rating)} />
                {own.comment && <p className="client-reader-review-words">{own.comment}</p>}
                <p className="client-reader-review-standing">{REVIEW_COPY.standing[own.status ?? "pending"]}</p>
              </div>
              {error && <p className="client-you-error client-reader-review-error" role="alert">{error}</p>}
              <div className="client-reader-review-actions">
                <button type="button" className="client-you-pill" onClick={() => { setError(null); setEditing(true); }} disabled={removing}>{REVIEW_COPY.edit}</button>
                <button type="button" className="client-you-pill" onClick={() => { void remove(own); }} disabled={removing} aria-busy={removing}>{REVIEW_COPY.remove}</button>
              </div>
            </>
          )}
        </article>
      )}

      {invited && (writing ? (
        <article className="client-you-card" aria-label={REVIEW_COPY.invite}>
          <p className="client-you-label">{REVIEW_COPY.invite}</p>
          <ReviewForm readerId={reader.id} onDone={async () => { await refresh(); setWriting(false); }} onCancel={() => setWriting(false)} />
        </article>
      ) : (
        <button type="button" className="client-you-pill client-reader-review-invite" onClick={() => setWriting(true)}>{REVIEW_COPY.invite}</button>
      ))}

      {total > 0 && (
        <div className="client-you-card">
          <ul className="client-reader-review-list">
            {Array.from({ length: pages }, (_, page) => <ReviewPage key={page} readerId={reader.id} page={page} />)}
          </ul>
          {pages * REVIEWS_PAGE_SIZE < total && (
            <button type="button" className="client-you-pill" onClick={() => setPages(count => count + 1)}>{REVIEW_COPY.more}</button>
          )}
        </div>
      )}
    </section>
  );
}

/* One page of the approved reviews, as everyone sees them (hers too, once
   approved). Each page is its own request, so Show more adds rows under the
   ones already drawn. */
function ReviewPage({ readerId, page }: { readerId: number; page: number }) {
  const reviews = usePsychicReviews(readerId, page, REVIEWS_PAGE_SIZE);
  return <>{(reviews.data ?? []).map(review => (
    <li key={review.id} className="client-reader-review">
      <div className="client-reader-review-meta">
        <Stars value={review.rating} label={REVIEW_COPY.starsValue(review.rating)} />
        <span>{review.username ?? ""}</span>
        <span>{dayOf(review.created_at)}</span>
      </div>
      {review.comment && <p className="client-reader-review-words">{review.comment}</p>}
    </li>
  ))}</>;
}

/* Write a new review, or change hers. Both wait for approval once sent. */
function ReviewForm({ readerId, review, onDone, onCancel }: {
  readerId: number;
  review?: Review;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [words, setWords] = useState(review?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || rating < 1) return;
    setError(null);
    setBusy(true);
    const comment = words.trim() || null;
    try {
      if (review) await reviewsApi.updateReview(review.id, { rating, comment });
      else await reviewsApi.createReview({ psychic_id: readerId, rating, comment });
      await onDone();
    } catch (failure) {
      setError(refusalText(failure));
      setBusy(false);
    }
  };

  return (
    <form className="client-you-form client-reader-review-form" onSubmit={event => { void submit(event); }}>
      <fieldset className="client-you-field">
        <legend className="client-you-label">{REVIEW_COPY.stars}</legend>
        <div className="client-reader-review-pick">
          {Array.from({ length: REVIEW_STARS }, (_, index) => index + 1).map(n => (
            <label key={n} className={`client-reader-review-star${n <= rating ? " is-lit" : ""}`}>
              <input type="radio" name="review-rating" value={n} checked={rating === n} onChange={() => setRating(n)} aria-label={REVIEW_COPY.starsValue(n)} />
              <span aria-hidden="true">★</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="client-you-field">
        <span className="client-you-label">{REVIEW_COPY.words}</span>
        <textarea className="client-you-input" value={words} maxLength={REVIEW_MAX_CHARS} placeholder={REVIEW_COPY.wordsHint} onChange={event => setWords(event.target.value)} />
        <span className="client-reader-review-counter" aria-hidden="true">{words.length}/{REVIEW_MAX_CHARS}</span>
      </label>
      {error && <p className="client-you-error" role="alert">{error}</p>}
      <button type="submit" className="client-you-solid" disabled={busy || rating < 1} aria-busy={busy}>{review ? REVIEW_COPY.save : REVIEW_COPY.send}</button>
      <button type="button" className="client-you-pill client-reader-review-cancel" onClick={onCancel} disabled={busy}>{REVIEW_COPY.cancel}</button>
    </form>
  );
}

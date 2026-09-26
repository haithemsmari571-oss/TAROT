/* A review's stars, as TAROT-BACKEND app/schemas/review.py takes them (rating
   1 to 5). One source for the reader's profile in the app
   (features/client-app/ClientReaderReviews.tsx) and the home page's reviews
   (features/home/components/TestimonialCarousel.tsx). */

export const REVIEW_STARS = 5;

/** A rating's spoken label, for example "4 of 5 stars". */
export const starsLabel = (n: number) => `${n} of ${REVIEW_STARS} stars`;

/** How many stars a rating lights: whole, and between 0 and REVIEW_STARS. */
export const litStars = (value: number) => Math.min(REVIEW_STARS, Math.max(0, Math.round(value)));

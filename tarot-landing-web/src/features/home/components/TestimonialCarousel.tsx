/* The home page's reviews: the real reviews clients wrote and the owner
   approved, newest first, in the floating field that once held invented
   testimonials. Each shows its stars, its words as written, the writer's first
   letter (the server sends "S.") and the reader's name. The public review API
   lists one reader at a time, so this reads the public roster, then each
   listed reader's approved reviews. With none anywhere, it draws nothing.
   Under 768px wide the field is one column: the cards stack full width in the
   page's side padding, with no floating, parallax or drag. At every width the
   words stop at four lines; the reader's page shows them in full. */
import { motion, useScroll, useTransform, useSpring, type MotionValue } from "framer-motion";
import { Icon } from "@iconify/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { psychicsApi } from "../../browse/api/psychicsApi";
import { reviewsApi } from "../../browse/api/reviewsApi";
import type { Review } from "../../browse/types/review.types";
import { litStars, REVIEW_STARS, starsLabel } from "../../../lib/reviewStars";
import "../../../styles/glass.css";

const POSITIONS = [
  { x: "15%", y: "20%", depth: 1.2 },
  { x: "65%", y: "15%", depth: 0.8 },
  { x: "40%", y: "50%", depth: 1.5 },
  { x: "10%", y: "70%", depth: 0.9 },
  { x: "70%", y: "75%", depth: 1.1 },
];

const HOME_REVIEW_COPY = {
  reader: (name: string) => `Reading with ${name}`,
} as const;

/* Below Tailwind's md (768px), where the card already changes size, the
   field is one column. */
const STACKED_QUERY = "(width < 768px)";
const stackedQuery = () => window.matchMedia(STACKED_QUERY);
const followStacked = (onChange: () => void) => {
  const query = stackedQuery();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useStacked = () => useSyncExternalStore(followStacked, () => stackedQuery().matches);

/* Earlier visits cached the invented testimonials under this key; nothing reads it now. */
const STALE_TESTIMONIALS_KEY = "landing_testimonials_content";

type HomeReview = Review & { readerName: string };

/** The newest approved reviews across the listed readers, one per place in the field at most. */
async function latestReviews(): Promise<HomeReview[]> {
  const roster = await psychicsApi.getPsychics();
  const perReader = await Promise.all(roster.items.map(reader =>
    reviewsApi.getPsychicReviews(reader.id, 0, POSITIONS.length)
      .then(reviews => reviews.map(review => ({ ...review, readerName: reader.username })))));
  return perReader.flat()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, POSITIONS.length);
}

const TestimonialCarousel = () => {
  useEffect(() => {
    try {
      localStorage.removeItem(STALE_TESTIMONIALS_KEY);
    } catch {
      // Storage refused (blocked site data): there is nothing of ours to clear.
    }
  }, []);
  const reviews = useQuery({ queryKey: ["home-reviews"], queryFn: latestReviews });
  if (!reviews.data?.length) return null;
  return <ReviewField reviews={reviews.data} />;
};

/* Mounted only with reviews to show, so the scroll target is there when
   useScroll first reads it. */
const ReviewField = ({ reviews }: { reviews: HomeReview[] }) => {
  const containerRef = useRef<HTMLElement>(null);
  const stacked = useStacked();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // Smooth spring for parallax movement
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  return (
    <section
      ref={containerRef}
      className={stacked
        ? "relative px-6 py-8"
        : "relative min-h-[120vh] py-32 overflow-hidden flex flex-col items-center justify-start"}
      style={{ backgroundColor: "transparent" }}
    >
      {/* Keyed by the layout, so crossing 768px remounts the cards without
          the other layout's inline place and motion. */}
      <motion.div
        key={stacked ? "stacked" : "field"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={stacked ? "relative z-10 flex flex-col gap-6" : "absolute inset-0 z-10 w-full h-full"}
      >
        {reviews.map((review, idx) => (
          <FloatingCard
            key={review.id}
            review={review}
            position={POSITIONS[idx]}
            progress={smoothProgress}
            stacked={stacked}
          />
        ))}
      </motion.div>
    </section>
  );
};

const FloatingCard = ({ review, position, progress, stacked }: {
  review: HomeReview;
  position: (typeof POSITIONS)[number];
  progress: MotionValue<number>;
  stacked: boolean;
}) => {
  // Parallax: Each card moves at a different speed based on its 'depth' property
  const yMovement = useTransform(progress, [0, 1], [100 * position.depth, -100 * position.depth]);
  const lit = litStars(review.rating);

  // Stacked, a card has no place in the field, no parallax and no drag (a
  // draggable card would hold the thumb that scrolls the page).
  return (
    <motion.div
      drag={!stacked}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.2}
      whileDrag={{ scale: 1.05, zIndex: 50 }}
      style={stacked ? undefined : { left: position.x, top: position.y, y: yMovement }}
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      className={stacked
        ? "gl-panel relative w-full p-6 group"
        : "gl-panel absolute p-6 md:p-8 cursor-grab active:cursor-grabbing w-[280px] md:w-[350px] group"}
    >
      <div className="relative z-10">
        {review.comment && <Icon icon="ph:quotes-fill" className="gl-acc text-3xl mb-4 opacity-40" />}

        <p className="gl-acc text-lg tracking-[0.2em] mb-4" role="img" aria-label={starsLabel(review.rating)}>
          {"★".repeat(lit)}<span className="opacity-30">{"★".repeat(REVIEW_STARS - lit)}</span>
        </p>

        {review.comment && (
          <p className="gl-italic-note leading-relaxed mb-6 text-base md:text-lg line-clamp-4">
            “{review.comment}”
          </p>
        )}

        <div className="flex flex-col">
          <h4 className="gl-serif gl-t" style={{ fontSize: 18 }}>
            {review.username}
          </h4>
          <span className="gl-tf text-[9px] uppercase tracking-widest mt-1">{HOME_REVIEW_COPY.reader(review.readerName)}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default TestimonialCarousel;

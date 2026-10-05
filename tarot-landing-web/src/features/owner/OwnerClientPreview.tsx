import { useRef, useState } from "react";
import { formatHomeDuration } from "@/features/client-app/homeDuration";
import { dayOf } from "@/features/client-app/ukTime";
import type { SanctuaryBrowseItem } from "@/features/sanctuary/api/libraryItemsApi";
import { Cover } from "@/features/sanctuary/cover";
import { sanitizeClaims } from "@/lib/copy";
import "@/features/client-app/client-home.css";
import "@/features/client-app/client-shorts.css";

/* How a post looks to clients (ROUND51), drawn with the app's own classes and
   stylesheets: the Shorts stage and its caption (ClientShortsScreen.tsx,
   client-shorts.css) and the Home post (ClientHomeScreen.tsx, client-home.css),
   with the same cover art, duration, day and wording guard. Every one of those
   rules sits under .client-app-shell, so the preview carries that class, and
   owner.css takes back the shell's own full-screen box. */

/* The verb under a Home post with a recording (ClientHomeScreen.tsx Post). */
const HOME_LISTEN = "Listen";

/* A reel as it stands in Shorts: the cover until it plays, the title and two
   lines of the description over its foot. A tap plays and pauses it, as in
   Shorts. */
export function OwnerShortsPreview({
  videoUrl,
  posterUrl,
  title,
  description,
}: {
  videoUrl: string;
  posterUrl: string | null;
  title: string;
  description: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(true);
  const toggle = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => undefined);
    else element.pause();
  };
  return (
    <div className="client-app-shell owner-client-preview owner-client-preview-shorts">
      <div className="client-shorts-stage" onClick={toggle}>
        <video
          ref={video}
          className="client-shorts-video"
          src={videoUrl}
          poster={posterUrl ?? undefined}
          playsInline
          loop
          muted
          preload="metadata"
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
        />
        {paused && <span className="client-shorts-play" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5L8 5.5Z" /></svg></span>}
        <div className="client-shorts-caption">
          <p className="client-shorts-title">{title}</p>
          {description && <p className="client-shorts-description">{sanitizeClaims(description)}</p>}
        </div>
        <span className="client-shorts-track" aria-hidden="true"><span className="client-shorts-progress" /></span>
      </div>
    </div>
  );
}

/* A recording as it stands on Home: the cover (or the generated art when it
   has none), the kind, length and day, the title, three lines of the
   description and Listen. */
export function OwnerHomePreview({
  type,
  title,
  description,
  coverUrl,
  durationSeconds,
  publishedAt,
}: {
  type: string;
  title: string;
  description: string;
  coverUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string;
}) {
  const item: SanctuaryBrowseItem = {
    key: "owner-preview",
    type,
    title,
    description,
    audioUrl: null,
    coverUrl,
    durationSeconds,
    publishedAt,
    interaction: "listen",
    source: "library",
  };
  const duration = formatHomeDuration(durationSeconds);
  return (
    <div className="client-app-shell owner-client-preview owner-client-preview-home">
      <div className="client-home-post">
        <span className="client-home-cover"><Cover item={item} /></span>
        <span className="client-home-copy">
          <span className="client-home-meta">{type}{duration && ` · ${duration}`}{` · ${dayOf(publishedAt)}`}</span>
          <span className="client-home-title">{title}</span>
          <span className="client-home-description">{sanitizeClaims(description)}</span>
          <span className="client-home-verb" aria-hidden="true">{HOME_LISTEN}</span>
        </span>
      </div>
    </div>
  );
}

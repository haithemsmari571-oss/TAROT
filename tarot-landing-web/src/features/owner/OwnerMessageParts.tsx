import { useState } from "react";
import { MODE_LABEL } from "./ownerMessages";
import type { ConversationMode } from "./ownerMessagesApi";
import { PULL_TRIGGER_PX } from "./usePullToRefresh";

/* The pieces the inbox and the conversation share (ROUND53). */

const PULL_COPY = {
  pull: "Pull to refresh",
  release: "Release to refresh",
  refreshing: "Refreshing…",
} as const;

/* The reader's picture in a round frame; her first letter when she has none
   or it does not load. */
export function ReaderPicture({ url, name, size }: { url: string | null; name: string; size: "row" | "head" }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showPicture = url && failed !== url;
  return (
    <span className={`owner-reader-picture is-${size}`} aria-hidden="true">
      {showPicture ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(url)} />
      ) : (
        <span className="owner-reader-initial">{name.trim().charAt(0).toUpperCase() || "·"}</span>
      )}
    </span>
  );
}

export function ModeChip({ mode }: { mode: ConversationMode }) {
  return <span className={`owner-mode-chip is-${mode}`}>{MODE_LABEL[mode]}</span>;
}

/* The pull at the top of the page, growing with the finger. */
export function PullIndicator({ pull, refreshing }: { pull: number; refreshing: boolean }) {
  if (pull <= 0 && !refreshing) return null;
  const line = refreshing ? PULL_COPY.refreshing : pull >= PULL_TRIGGER_PX ? PULL_COPY.release : PULL_COPY.pull;
  return (
    <div className="owner-pull" style={{ height: refreshing ? PULL_TRIGGER_PX * 0.6 : pull }} role="status">
      <span>{line}</span>
    </div>
  );
}

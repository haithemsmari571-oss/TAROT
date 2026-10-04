import { useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatCaptionCount, MAX_CAPTION_LENGTH, splitCaption } from "./ownerCaption";
import { COVER_ACCEPT, coverAccepted, formatDuration, kindLabel, MAX_TITLE_LENGTH } from "./ownerMedia";
import { OWNER_PATH } from "./ownerPaths";
import { PUBLISH_COPY, publishBusy, publishStatus, type OwnerPublish } from "./ownerPublish";

/* The pieces the owner's screens share (ROUND50, ROUND51): the way back, a
   file chooser drawn as a big button, the caption box, the video and audio
   previews, the cover chooser, the Share block with its steps, a confirm
   step, and the kind and Hidden badges. */

const COPY = {
  back: "Back",
  captionLabel: "Caption",
  captionPlaceholder: "Write a caption…",
  firstLine: "The first line is the title.",
  titleCut: `The title stops at ${MAX_TITLE_LENGTH} characters. The rest of that line goes under it.`,
  play: "Play",
  pause: "Pause",
  coverRefused: "This photo cannot be used. Choose another one.",
  hidden: "Hidden",
} as const;

function BackGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

/* Home by default; a step's own way back when it is given one. */
export function OwnerBack({ onClick, disabled }: { onClick?: () => void; disabled?: boolean }) {
  if (onClick) {
    return (
      <button type="button" className="owner-back" onClick={onClick} disabled={disabled}>
        <BackGlyph />
        {COPY.back}
      </button>
    );
  }
  return (
    <Link className="owner-back" to={OWNER_PATH}>
      <BackGlyph />
      {COPY.back}
    </Link>
  );
}

export function OwnerFileChooser({
  label,
  accept,
  disabled,
  quiet,
  onChoose,
}: {
  label: string;
  accept: string;
  disabled: boolean;
  /* A pill under a picture ("Change cover") rather than the big dashed area. */
  quiet?: boolean;
  onChoose: (file: File | null) => void;
}) {
  return (
    <label className={`${quiet ? "owner-choose-quiet" : "owner-choose"}${disabled ? " is-disabled" : ""}`}>
      <input
        type="file"
        className="owner-file-input"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          // Cleared so the same file can be chosen again after a change of mind.
          event.target.value = "";
          onChoose(file);
        }}
      />
      <span>{label}</span>
    </label>
  );
}

export function OwnerField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="owner-field">
      <span className="owner-label">{label}</span>
      {children}
    </label>
  );
}

/* One large box, as on Instagram: line breaks kept, a counter to 2,200, and
   the first line read as the title (ownerCaption.ts). */
export function OwnerCaptionBox({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const { titleCut } = splitCaption(value);
  return (
    <div className="owner-field">
      <label className="owner-label" htmlFor={`${id}-caption`}>{COPY.captionLabel}</label>
      <textarea
        id={`${id}-caption`}
        className="owner-input owner-caption"
        name="caption"
        rows={6}
        value={value}
        placeholder={COPY.captionPlaceholder}
        maxLength={MAX_CAPTION_LENGTH}
        autoCapitalize="sentences"
        aria-describedby={`${id}-hint ${id}-count`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="owner-caption-foot">
        <p className="owner-caption-hint" id={`${id}-hint`}>{titleCut ? COPY.titleCut : COPY.firstLine}</p>
        <span className="owner-caption-count" id={`${id}-count`}>{formatCaptionCount(value.length)}</span>
      </div>
    </div>
  );
}

function PlayGlyph({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5L8 5.5Z" /></svg>
  );
}

/* A chosen video, playing muted inline; a tap pauses it. */
export function OwnerVideoPreview({
  url,
  caption,
  onDuration,
}: {
  url: string;
  caption?: string;
  onDuration?: (seconds: number | null) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const toggle = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => undefined);
    else element.pause();
  };
  return (
    <figure className="owner-preview">
      <button type="button" className="owner-video-frame" onClick={toggle} aria-label={paused ? COPY.play : COPY.pause}>
        <video
          ref={video}
          className="owner-video"
          src={url}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onLoadedMetadata={(event) => {
            const seconds = event.currentTarget.duration;
            onDuration?.(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
          }}
        />
        {paused && <span className="owner-video-paused" aria-hidden="true"><PlayGlyph playing={false} /></span>}
      </button>
      {caption && <figcaption className="owner-note">{caption}</figcaption>}
    </figure>
  );
}

/* A recording: one play button and its length. */
export function OwnerAudioPreview({
  url,
  caption,
  onDuration,
}: {
  url: string;
  caption?: string;
  onDuration?: (seconds: number | null) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => undefined);
    else element.pause();
  };
  return (
    <figure className="owner-preview owner-audio-preview">
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration;
          const known = Number.isFinite(seconds) && seconds > 0 ? seconds : null;
          setDuration(known);
          onDuration?.(known);
        }}
      />
      <button type="button" className="owner-play" onClick={toggle} aria-label={playing ? COPY.pause : COPY.play}>
        <PlayGlyph playing={playing} />
      </button>
      <figcaption className="owner-audio-copy">
        <span className="owner-audio-time">{duration !== null ? formatDuration(duration) : "–:––"}</span>
        {caption && <span className="owner-note">{caption}</span>}
      </figcaption>
    </figure>
  );
}

/* A cover photo, checked when it is chosen (the server's types and size,
   ownerMedia.ts), before any work. */
export function OwnerCoverChooser({
  label,
  disabled,
  quiet,
  onChoose,
}: {
  label: string;
  disabled: boolean;
  quiet?: boolean;
  onChoose: (file: File) => void;
}) {
  const [refused, setRefused] = useState(false);
  return (
    <>
      <OwnerFileChooser
        label={label}
        accept={COVER_ACCEPT}
        disabled={disabled}
        quiet={quiet}
        onChoose={(file) => {
          if (!file) return;
          const accepted = coverAccepted(file);
          setRefused(!accepted);
          if (accepted) onChoose(file);
        }}
      />
      {refused && <p className="owner-error" role="alert">{COPY.coverRefused}</p>}
    </>
  );
}

/* Share, with ROUND50's steps in words and the progress bar; a failure keeps
   its line and offers Try again with what was entered. */
export function OwnerShareBlock({
  publish,
  ready,
  onShare,
}: {
  publish: OwnerPublish;
  ready: boolean;
  onShare: () => void;
}) {
  const { step, percent, failure } = publish;
  const status = publishStatus(step, percent);
  return (
    <div className="owner-publish">
      {step === "failed" && <p className="owner-error" role="alert">{failure}</p>}
      <button type="button" className="owner-button" onClick={onShare} disabled={!ready || publishBusy(step)}>
        {step === "failed" ? PUBLISH_COPY.tryAgain : PUBLISH_COPY.share}
      </button>
      <p className="owner-note">{PUBLISH_COPY.keepScreenOn}</p>
      <p className="owner-status" aria-live="polite">{status}</p>
      {step === "uploading" && (
        <div className="owner-progress" role="progressbar" aria-label={status ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

/* A question before something that cannot be taken back, drawn in place of
   the screen. Keeping things as they are is the button that has the focus. */
export function OwnerConfirm({
  heading,
  line,
  confirmLabel,
  cancelLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  heading: string;
  line: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  return (
    <section className="owner-panel owner-confirm" role="alertdialog" aria-labelledby={`${id}-heading`} aria-describedby={`${id}-line`}>
      <h2 className="owner-confirm-title" id={`${id}-heading`}>{heading}</h2>
      <p className="owner-note" id={`${id}-line`}>{line}</p>
      {error && <p className="owner-error" role="alert">{error}</p>}
      <button type="button" className="owner-button owner-button-danger" onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
      <button type="button" className="owner-button-quiet" onClick={onCancel} disabled={busy} autoFocus>{cancelLabel}</button>
    </section>
  );
}

/* The post's kind as clients see it (Reel, Podcast, Meditation), and Hidden
   while it is switched off. */
export function OwnerPostBadges({ type, enabled }: { type: string; enabled: boolean }) {
  return (
    <span className="owner-badges">
      <span className="owner-badge">{kindLabel(type)}</span>
      {!enabled && <span className="owner-badge owner-badge-hidden">{COPY.hidden}</span>}
    </span>
  );
}

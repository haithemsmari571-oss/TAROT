import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { splitCaption } from "./ownerCaption";
import { OwnerHomePreview, OwnerShortsPreview } from "./OwnerClientPreview";
import {
  captureVideoFrame,
  classifyMedia,
  formatDuration,
  formatSize,
  MAX_MEDIA_BYTES,
  MEDIA_ACCEPT,
  POST_KIND_ORDER,
  POST_KINDS,
  type MediaFile,
  type MediaRefusal,
  type PostKind,
} from "./ownerMedia";
import {
  OwnerAudioPreview,
  OwnerBack,
  OwnerCaptionBox,
  OwnerConfirm,
  OwnerCoverChooser,
  OwnerFileChooser,
  OwnerShareBlock,
  OwnerVideoPreview,
} from "./OwnerParts";
import { OWNER_PATH, OWNER_SIGN_IN_PATH } from "./ownerPaths";
import { OWNER_POSTS_QUERY_KEY } from "./ownerPosts";
import { publishBusy, useOwnerPublish } from "./ownerPublish";
import { useFilePreview } from "./useFilePreview";

const STEPS = ["choose", "kind", "caption", "share"] as const;
type Step = (typeof STEPS)[number];

const COPY = {
  heading: "New post",
  steps: { choose: "Choose", kind: "Kind", caption: "Caption", share: "Share" } satisfies Record<Step, string>,
  stepOf: (index: number) => `${index + 1} of ${STEPS.length}`,
  close: "Close",
  next: "Next",
  choose: "Choose a video or a recording",
  chooseAnother: "Choose another file",
  iphone: "On iPhone, save a recording to Files first.",
  refusals: {
    notMedia: "This file cannot be posted. Choose a video or a recording.",
    videoTooBig: `This video is over ${MAX_MEDIA_BYTES.video / (1024 * 1024)} MB. Choose a shorter one.`,
    audioTooBig: "This recording is too big to post. Choose a smaller one.",
  } satisfies Record<MediaRefusal, string>,
  kindWhere: {
    reel: "A video. It appears in Shorts.",
    podcast: "A recording. It appears on Home.",
    meditation: "A recording. It appears on Home.",
  } satisfies Record<PostKind, string>,
  kindVideo: "A video is posted as a reel.",
  kindAudio: "Is this recording a podcast or a meditation?",
  cover: "Cover",
  addCover: "Add cover",
  changeCover: "Change cover",
  useFrame: "Use the video's own frame",
  takingFrame: "Taking a cover from the video…",
  frameFailed: "No cover could be taken from this video. Add a photo, or share it without one.",
  coverNeeded: "Home shows a cover with every recording.",
  preview: "How clients see it",
  posted: { video: "Posted. It's in Shorts.", audio: "Posted. It's on Home." },
  postAnother: "Post another",
  discardHeading: "Discard this post?",
  discardLine: "What you chose and wrote here will be lost. Nothing has been posted.",
  discardWhileSharing: "It is still being shared. Discarding stops it.",
  discard: "Discard",
  keepEditing: "Keep editing",
} as const;

/* The flow's own entry in the browser's history, above its address: the
   phone's Back lands below it and is taken as the screen's Back (a step back,
   or "Discard this post?"), never as leaving without a word. */
const GUARD_STATE = { ownerNewPost: true };
const isGuard = (state: unknown) => (state as typeof GUARD_STATE | null)?.ownerNewPost === true;

function KindGlyph({ kind }: { kind: PostKind }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "reel" && <><rect x="7" y="4" width="10" height="16" rx="2.5" /><path d="M10.5 9.5v5l4-2.5-4-2.5Z" /></>}
      {kind === "podcast" && <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" /><path d="M12 18v2.5" /></>}
      {kind === "meditation" && <><path d="M15.5 4.5a7.5 7.5 0 1 0 4 13.6A8 8 0 0 1 15.5 4.5Z" /><path d="M18 5.5l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5.5-1.2Z" /></>}
    </svg>
  );
}

/* New post (ROUND51), one flow as on Instagram: Choose a video or a
   recording, say what Kind of post it is, write the Caption (its first line
   the title) with the cover and a live preview, then Share through ROUND50's
   steps. Back and Next keep everything entered; nothing reaches the server
   until Share. */
export default function OwnerNewPostScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const signedOut = useCallback(() => navigate(OWNER_SIGN_IN_PATH, { replace: true }), [navigate]);
  const publish = useOwnerPublish(signedOut);
  const resetPublish = publish.reset;

  const [step, setStep] = useState<Step>("choose");
  const [media, setMedia] = useState<(MediaFile & { file: File }) | null>(null);
  const [refusal, setRefusal] = useState<MediaRefusal | null>(null);
  const [mediaPreview, showMediaPreview] = useFilePreview();
  const [duration, setDuration] = useState<number | null>(null);
  const [kind, setKind] = useState<PostKind | null>(null);
  const [caption, setCaption] = useState("");
  // A reel's cover is the frame at one second until a photo replaces it.
  const [frame, showFrame] = useFilePreview();
  const [frameState, setFrameState] = useState<"none" | "taking" | "failed">("none");
  const [photo, showPhoto] = useFilePreview();
  const frameFor = useRef<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The day a post shared now carries, as the preview shows it.
  const [today] = useState(() => new Date().toISOString());

  const busy = publishBusy(publish.step);
  const posted = publish.step === "done";
  const stepIndex = STEPS.indexOf(step);
  const { title, description } = splitCaption(caption);
  const isVideo = media?.medium === "video";
  const cover = isVideo ? photo ?? frame : photo;
  // A reel has its cover coming while the frame is drawn.
  const hasCover = !!cover || (isVideo && frameState === "taking");
  const dirty = media !== null || caption.trim() !== "";
  const canLeaveStep: Record<Step, boolean> = {
    choose: media !== null,
    kind: !!media && !!kind && POST_KINDS[kind].medium === media.medium,
    caption: title !== "" && (isVideo || photo !== null),
    share: false,
  };
  const ready = canLeaveStep.kind && canLeaveStep.caption && !busy && !posted;

  // A frame still being drawn when the flow closes is dropped, and a post
  // still going up is stopped.
  useEffect(() => () => {
    frameFor.current = null;
    resetPublish();
  }, [resetPublish]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step, confirming]);

  useEffect(() => {
    if (posted) void queryClient.invalidateQueries({ queryKey: OWNER_POSTS_QUERY_KEY });
  }, [posted, queryClient]);

  // Closing the tab or reloading with something entered asks the browser's own question.
  useEffect(() => {
    if (!dirty || posted) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, posted]);

  const chooseMedia = (file: File | null) => {
    if (!file) return;
    const result = classifyMedia(file);
    resetPublish();
    setDuration(null);
    frameFor.current = null;
    showFrame(null);
    setFrameState("none");
    if ("refusal" in result) {
      setRefusal(result.refusal);
      setMedia(null);
      showMediaPreview(null);
      return;
    }
    setRefusal(null);
    setMedia({ ...result, file });
    showMediaPreview(file);
    // A video is a reel; a recording keeps a podcast or meditation already chosen.
    setKind((current) => (result.medium === "video" ? "reel" : current && POST_KINDS[current].medium === "audio" ? current : null));
    if (result.medium !== "video") return;
    frameFor.current = file;
    setFrameState("taking");
    captureVideoFrame(file).then(
      (picture) => {
        if (frameFor.current !== file) return;
        showFrame(picture);
        setFrameState("none");
      },
      () => {
        if (frameFor.current === file) setFrameState("failed");
      },
    );
  };

  const share = () => {
    if (!media || !kind || !ready) return;
    void publish.publish({
      medium: media.medium,
      file: media.file,
      contentType: media.contentType,
      itemType: kind,
      title,
      description,
      cover: cover?.file ?? null,
    });
  };

  const postAnother = () => {
    resetPublish();
    frameFor.current = null;
    setMedia(null);
    showMediaPreview(null);
    setRefusal(null);
    setDuration(null);
    setKind(null);
    setCaption("");
    showFrame(null);
    showPhoto(null);
    setFrameState("none");
    setStep("choose");
  };

  /* Out of the flow to the page before it: past the flow's own entry when
     the page is on it (React Router numbers its entries, idx), or home when
     the flow was the first page opened. */
  const leave = useCallback(() => {
    const entry = window.history.state as { usr?: unknown; idx?: number } | null;
    const onGuard = isGuard(entry?.usr);
    const flowIndex = (entry?.idx ?? 0) - (onGuard ? 1 : 0);
    if (flowIndex > 0) navigate(onGuard ? -2 : -1);
    else navigate(OWNER_PATH, { replace: true });
  }, [navigate]);

  /* The screen's Back: a step back, or the question when leaving would lose
     something. "leave" when there is nothing to keep. */
  const stepBack = (): "stay" | "leave" => {
    if (confirming) {
      setConfirming(false);
      return "stay";
    }
    if (posted) return "leave";
    if (busy) {
      setConfirming(true);
      return "stay";
    }
    if (stepIndex > 0) {
      setStep(STEPS[stepIndex - 1]);
      return "stay";
    }
    if (dirty) {
      setConfirming(true);
      return "stay";
    }
    return "leave";
  };
  const back = () => {
    if (stepBack() === "leave") leave();
  };
  const close = () => {
    if (posted || !dirty) leave();
    else setConfirming(true);
  };

  const stepBackRef = useRef(stepBack);
  useEffect(() => {
    stepBackRef.current = stepBack;
  });
  const seenKey = useRef<string | null>(null);
  useEffect(() => {
    if (location.key === seenKey.current) return;
    const first = seenKey.current === null;
    seenKey.current = location.key;
    if (isGuard(location.state)) return;
    if (first) {
      navigate(location.pathname, { state: GUARD_STATE });
      return;
    }
    // The phone's Back took the page off the flow's own entry.
    if (stepBackRef.current() === "leave") leave();
    else navigate(location.pathname, { state: GUARD_STATE });
    // Only a move in the history is an answer here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const next = () => setStep(STEPS[stepIndex + 1]);
  const nextButton = (
    <button type="button" className="owner-button" onClick={next} disabled={!canLeaveStep[step]}>
      {COPY.next}
    </button>
  );

  const mediaNote = media
    ? media.medium === "video"
      ? `${duration !== null ? `${formatDuration(duration)} · ` : ""}${formatSize(media.file.size)}`
      : `${media.file.name} · ${formatSize(media.file.size)}`
    : "";

  const clientPreview = media && mediaPreview && kind && (
    <div className="owner-preview-block">
      <span className="owner-label">{COPY.preview}</span>
      {isVideo ? (
        <OwnerShortsPreview videoUrl={mediaPreview.url} posterUrl={cover?.url ?? null} title={title} description={description} />
      ) : (
        <OwnerHomePreview
          type={kind}
          title={title}
          description={description}
          coverUrl={photo?.url ?? null}
          // The length as the server keeps it (three decimals).
          durationSeconds={duration === null ? null : Math.round(duration * 1000) / 1000}
          publishedAt={today}
        />
      )}
    </div>
  );

  let body: ReactNode;
  if (step === "choose") {
    body = (
      <>
        <div className="owner-field">
          <OwnerFileChooser label={media ? COPY.chooseAnother : COPY.choose} accept={MEDIA_ACCEPT} disabled={busy} onChoose={chooseMedia} />
          <p className="owner-note">{COPY.iphone}</p>
        </div>
        {refusal && <p className="owner-error" role="alert">{COPY.refusals[refusal]}</p>}
        {media && mediaPreview && (media.medium === "video"
          ? <OwnerVideoPreview url={mediaPreview.url} caption={mediaNote} onDuration={setDuration} />
          : <OwnerAudioPreview url={mediaPreview.url} caption={mediaNote} onDuration={setDuration} />)}
        {nextButton}
      </>
    );
  } else if (step === "kind") {
    body = (
      <>
        <div className="owner-kinds" role="group" aria-label={COPY.steps.kind}>
          {POST_KIND_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              className="owner-panel owner-kind"
              aria-pressed={kind === option}
              disabled={!media || POST_KINDS[option].medium !== media.medium}
              onClick={() => setKind(option)}
              data-owner-kind={option}
            >
              <KindGlyph kind={option} />
              <span className="owner-kind-copy">
                <span className="owner-kind-name">{POST_KINDS[option].label}</span>
                <span className="owner-kind-where">{COPY.kindWhere[option]}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="owner-note">{isVideo ? COPY.kindVideo : COPY.kindAudio}</p>
        {nextButton}
      </>
    );
  } else if (step === "caption") {
    body = (
      <>
        <div className="owner-cover-row">
          <div className={`owner-cover-frame ${isVideo ? "is-portrait" : "is-square"}`}>
            {cover && <img src={cover.url} alt="" />}
          </div>
          <div className="owner-cover-actions">
            <span className="owner-label">{COPY.cover}</span>
            {isVideo && !photo && frameState === "taking" && <p className="owner-note owner-note-left">{COPY.takingFrame}</p>}
            {isVideo && !photo && frameState === "failed" && <p className="owner-note owner-note-left">{COPY.frameFailed}</p>}
            {!isVideo && !photo && <p className="owner-note owner-note-left">{COPY.coverNeeded}</p>}
            <OwnerCoverChooser label={hasCover ? COPY.changeCover : COPY.addCover} quiet={hasCover} disabled={busy} onChoose={showPhoto} />
            {isVideo && photo && frame && (
              <button type="button" className="owner-button-quiet" onClick={() => showPhoto(null)} disabled={busy}>{COPY.useFrame}</button>
            )}
          </div>
        </div>
        <OwnerCaptionBox value={caption} disabled={busy} onChange={setCaption} />
        {clientPreview}
        {nextButton}
      </>
    );
  } else {
    body = (
      <>
        {clientPreview}
        {posted && media ? (
          <div className="owner-posted">
            <p className="owner-done" role="status">{COPY.posted[media.medium]}</p>
            <button type="button" className="owner-button-quiet" onClick={postAnother}>{COPY.postAnother}</button>
          </div>
        ) : (
          <OwnerShareBlock publish={publish} ready={ready} onShare={share} />
        )}
      </>
    );
  }

  return (
    <main className="owner-screen owner-flow">
      <header className="owner-flow-head">
        <OwnerBack onClick={back} />
        <button type="button" className="owner-close" onClick={close} aria-label={COPY.close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <div className="owner-flow-title">
        <h1 className="owner-title">{COPY.heading}</h1>
        <p className="owner-step">{COPY.stepOf(stepIndex)} · {COPY.steps[step]}</p>
        <ol className="owner-step-dots" aria-hidden="true">
          {STEPS.map((each, index) => <li key={each} className={index <= stepIndex ? "is-done" : undefined} />)}
        </ol>
      </div>
      {confirming && !posted ? (
        <OwnerConfirm
          heading={COPY.discardHeading}
          line={busy ? COPY.discardWhileSharing : COPY.discardLine}
          confirmLabel={COPY.discard}
          cancelLabel={COPY.keepEditing}
          onConfirm={() => {
            resetPublish();
            leave();
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <section className="owner-panel owner-form" aria-label={COPY.steps[step]} data-owner-step={step}>
          {body}
        </section>
      )}
    </main>
  );
}

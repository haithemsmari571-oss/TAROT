import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OwnerBack, OwnerCoverField, OwnerField, OwnerFileChooser, OwnerPublishBlock } from "./OwnerParts";
import {
  MAX_REEL_BYTES,
  MAX_TITLE_LENGTH,
  REEL_ACCEPT,
  REEL_ITEM_TYPE,
  REEL_TYPES,
  formatDuration,
  formatSize,
  serverContentType,
} from "./ownerMedia";
import { OWNER_SIGN_IN_PATH } from "./ownerPaths";
import { publishBusy, useOwnerPublish } from "./ownerPublish";
import { useFilePreview } from "./useFilePreview";

const COPY = {
  heading: "Post a reel",
  choose: "Choose a video",
  chooseAnother: "Choose another video",
  tooBig: `This video is over ${MAX_REEL_BYTES / (1024 * 1024)} MB. Choose a shorter one.`,
  notVideo: "This file is not a video that can be posted. Choose another one.",
  title: "Title",
  cover: "Cover photo (optional)",
  done: "Posted. It's in Shorts.",
} as const;

/* Post a reel (ROUND50): choose a video, see it with its length and size,
   give it a title and, if wanted, a cover photo, then Publish. A video over
   the server's cap is refused before any work. */
export default function OwnerReelScreen() {
  const navigate = useNavigate();
  const signedOut = useCallback(() => navigate(OWNER_SIGN_IN_PATH, { replace: true }), [navigate]);
  const publish = useOwnerPublish(signedOut);
  const [video, setVideo] = useState<{ file: File; contentType: string } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [preview, showPreview] = useFilePreview();
  const busy = publishBusy(publish.step);

  const chooseVideo = (file: File | null) => {
    if (!file) return;
    publish.reset();
    setDuration(null);
    const contentType = file.size > MAX_REEL_BYTES ? null : serverContentType(file, REEL_TYPES);
    if (!contentType) {
      setVideo(null);
      showPreview(null);
      setRefusal(file.size > MAX_REEL_BYTES ? COPY.tooBig : COPY.notVideo);
      return;
    }
    setRefusal(null);
    setVideo({ file, contentType });
    showPreview(file);
  };

  const ready = !!video && title.trim().length > 0 && !busy && publish.step !== "done";
  const onPublish = () => {
    if (!video) return;
    void publish.publish({
      medium: "video",
      file: video.file,
      contentType: video.contentType,
      itemType: REEL_ITEM_TYPE,
      title: title.trim(),
      description: "",
      cover,
    });
  };

  return (
    <main className="owner-screen owner-post">
      <OwnerBack />
      <h1 className="owner-title">{COPY.heading}</h1>
      <section className="owner-panel owner-form">
        <OwnerFileChooser label={video ? COPY.chooseAnother : COPY.choose} accept={REEL_ACCEPT} disabled={busy} onChoose={chooseVideo} />
        {refusal && <p className="owner-error" role="alert">{refusal}</p>}
        {video && preview && (
          <figure className="owner-preview">
            <video
              className="owner-video"
              src={preview.url}
              controls
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={(event) => {
                const seconds = event.currentTarget.duration;
                setDuration(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
              }}
            />
            <figcaption className="owner-note">
              {duration !== null ? `${formatDuration(duration)} · ` : ""}{formatSize(video.file.size)}
            </figcaption>
          </figure>
        )}
        <OwnerField label={COPY.title}>
          <input
            className="owner-input"
            type="text"
            name="title"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy}
            required
          />
        </OwnerField>
        <OwnerCoverField label={COPY.cover} cover={cover} disabled={busy} removable onChange={setCover} />
        <OwnerPublishBlock publish={publish} ready={ready} doneLine={COPY.done} onPublish={onPublish} />
      </section>
    </main>
  );
}

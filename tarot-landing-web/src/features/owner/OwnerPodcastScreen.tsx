import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OwnerBack, OwnerCoverField, OwnerField, OwnerFileChooser, OwnerPublishBlock } from "./OwnerParts";
import {
  MAX_PODCAST_BYTES,
  MAX_TITLE_LENGTH,
  PODCAST_ACCEPT,
  PODCAST_ITEM_TYPE,
  PODCAST_TYPES,
  formatDuration,
  formatSize,
  serverContentType,
} from "./ownerMedia";
import { OWNER_SIGN_IN_PATH } from "./ownerPaths";
import { publishBusy, useOwnerPublish } from "./ownerPublish";
import { useFilePreview } from "./useFilePreview";

const COPY = {
  heading: "Post a podcast",
  choose: "Choose an audio file",
  chooseAnother: "Choose another audio file",
  iphone: "On iPhone, save the recording to Files first.",
  tooBig: "This recording is too big to post. Choose a smaller one.",
  notAudio: "This file is not a recording that can be posted. Choose another one.",
  title: "Title",
  description: "Description (optional)",
  cover: "Cover image",
  done: "Posted. It's on Home.",
} as const;

/* Post a podcast (ROUND50): an audio file, a title, an optional description
   and a cover image, which Home needs, then Publish. The description has no
   limit because the server sets none (a Text column, no schema maximum). */
export default function OwnerPodcastScreen() {
  const navigate = useNavigate();
  const signedOut = useCallback(() => navigate(OWNER_SIGN_IN_PATH, { replace: true }), [navigate]);
  const publish = useOwnerPublish(signedOut);
  const [audio, setAudio] = useState<{ file: File; contentType: string } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [preview, showPreview] = useFilePreview();
  const busy = publishBusy(publish.step);

  const chooseAudio = (file: File | null) => {
    if (!file) return;
    publish.reset();
    setDuration(null);
    const contentType = file.size > MAX_PODCAST_BYTES ? null : serverContentType(file, PODCAST_TYPES);
    if (!contentType) {
      setAudio(null);
      showPreview(null);
      setRefusal(file.size > MAX_PODCAST_BYTES ? COPY.tooBig : COPY.notAudio);
      return;
    }
    setRefusal(null);
    setAudio({ file, contentType });
    showPreview(file);
  };

  const ready = !!audio && !!cover && title.trim().length > 0 && !busy && publish.step !== "done";
  const onPublish = () => {
    if (!audio || !cover) return;
    void publish.publish({
      medium: "audio",
      file: audio.file,
      contentType: audio.contentType,
      itemType: PODCAST_ITEM_TYPE,
      title: title.trim(),
      description: description.trim(),
      cover,
    });
  };

  return (
    <main className="owner-screen owner-post">
      <OwnerBack />
      <h1 className="owner-title">{COPY.heading}</h1>
      <section className="owner-panel owner-form">
        <div className="owner-field">
          <OwnerFileChooser label={audio ? COPY.chooseAnother : COPY.choose} accept={PODCAST_ACCEPT} disabled={busy} onChoose={chooseAudio} />
          <p className="owner-note">{COPY.iphone}</p>
        </div>
        {refusal && <p className="owner-error" role="alert">{refusal}</p>}
        {audio && preview && (
          <figure className="owner-preview">
            <audio
              className="owner-audio"
              src={preview.url}
              controls
              preload="metadata"
              onLoadedMetadata={(event) => {
                const seconds = event.currentTarget.duration;
                setDuration(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
              }}
            />
            <figcaption className="owner-note">
              {audio.file.name} · {duration !== null ? `${formatDuration(duration)} · ` : ""}{formatSize(audio.file.size)}
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
        <OwnerField label={COPY.description}>
          <textarea
            className="owner-input owner-textarea"
            name="description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={busy}
          />
        </OwnerField>
        <OwnerCoverField label={COPY.cover} cover={cover} disabled={busy} removable={false} onChange={setCover} />
        <OwnerPublishBlock publish={publish} ready={ready} doneLine={COPY.done} onPublish={onPublish} />
      </section>
    </main>
  );
}

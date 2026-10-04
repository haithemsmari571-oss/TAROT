import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { COVER_ACCEPT, coverAccepted } from "./ownerMedia";
import { OWNER_PATH } from "./ownerPaths";
import { PUBLISH_COPY, publishBusy, publishStatus, type OwnerPublish } from "./ownerPublish";
import { useFilePreview } from "./useFilePreview";

/* The pieces both posting screens share (ROUND50): the way back home, a file
   chooser drawn as a big button, the cover field, and the Publish block with
   its steps. */

const COVER_COPY = {
  choose: "Choose a photo",
  chooseAnother: "Choose another photo",
  remove: "Remove photo",
  refused: "This photo cannot be used. Choose another one.",
} as const;

export function OwnerBack() {
  return (
    <Link className="owner-back" to={OWNER_PATH}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 5 8 12l7 7" />
      </svg>
      Back
    </Link>
  );
}

export function OwnerFileChooser({
  label,
  accept,
  disabled,
  onChoose,
}: {
  label: string;
  accept: string;
  disabled: boolean;
  onChoose: (file: File | null) => void;
}) {
  return (
    <label className={`owner-choose${disabled ? " is-disabled" : ""}`}>
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

/* The cover photo, checked when it is chosen (the server's types and size,
   ownerMedia.ts), before any work. */
export function OwnerCoverField({
  label,
  cover,
  disabled,
  removable,
  onChange,
}: {
  label: string;
  cover: File | null;
  disabled: boolean;
  removable: boolean;
  onChange: (cover: File | null) => void;
}) {
  const [refused, setRefused] = useState(false);
  const [preview, showPreview] = useFilePreview();
  const choose = (file: File | null) => {
    if (!file) return;
    setRefused(!coverAccepted(file));
    if (!coverAccepted(file)) return;
    showPreview(file);
    onChange(file);
  };
  const remove = () => {
    showPreview(null);
    onChange(null);
  };
  return (
    <div className="owner-field">
      <span className="owner-label">{label}</span>
      {cover && preview && <img className="owner-cover" src={preview.url} alt="" />}
      <OwnerFileChooser label={cover ? COVER_COPY.chooseAnother : COVER_COPY.choose} accept={COVER_ACCEPT} disabled={disabled} onChoose={choose} />
      {removable && cover && (
        <button type="button" className="owner-button-quiet" onClick={remove} disabled={disabled}>
          {COVER_COPY.remove}
        </button>
      )}
      {refused && <p className="owner-error" role="alert">{COVER_COPY.refused}</p>}
    </div>
  );
}

export function OwnerPublishBlock({
  publish,
  ready,
  doneLine,
  onPublish,
}: {
  publish: OwnerPublish;
  ready: boolean;
  doneLine: string;
  onPublish: () => void;
}) {
  const { step, percent, failure } = publish;
  const status = publishStatus(step, percent);
  return (
    <div className="owner-publish">
      {step === "done" ? (
        <p className="owner-done" role="status">{doneLine}</p>
      ) : step === "failed" ? (
        <>
          <p className="owner-error" role="alert">{failure}</p>
          <button type="button" className="owner-button" onClick={onPublish} disabled={!ready}>
            {PUBLISH_COPY.tryAgain}
          </button>
        </>
      ) : (
        <button type="button" className="owner-button" onClick={onPublish} disabled={!ready || publishBusy(step)}>
          {PUBLISH_COPY.publish}
        </button>
      )}
      {step !== "done" && <p className="owner-note">{PUBLISH_COPY.keepScreenOn}</p>}
      <p className="owner-status" aria-live="polite">{status}</p>
      {step === "uploading" && (
        <div className="owner-progress" role="progressbar" aria-label={status ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

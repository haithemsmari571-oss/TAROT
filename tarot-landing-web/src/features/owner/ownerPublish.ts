import { useCallback, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { hashMediaFile, type MediaHashes } from "./mediaHashes";
import { probeMedia, type MediaProbe } from "./ownerMedia";
import {
  finishItem,
  originalFilename,
  putToStorage,
  registerItem,
  requestUploadGrant,
  StorageUploadError,
  type OwnerLibraryItem,
  type OwnerMedium,
  type UploadClaim,
  type UploadGrant,
} from "./ownerLibraryApi";
import { ownerSessionUsable } from "./ownerSession";

/* The words the owner sees while a post goes up (ROUND50), one source for
   both screens. */
export const PUBLISH_COPY = {
  publish: "Publish",
  checking: "Checking",
  uploading: (percent: number) => `Uploading ${percent}%`,
  publishing: "Publishing",
  keepScreenOn: "Keep the screen on while it uploads.",
  tryAgain: "Try again",
  unreadable: "This file could not be read. Choose another one.",
  refusedFile: "This file cannot be posted. Choose another one.",
  uploadStopped: "The upload stopped. Check the connection and try again.",
  notPosted: "It did not post. Try again.",
} as const;

export type PublishStep = "idle" | "checking" | "uploading" | "publishing" | "done" | "failed";

export interface PublishInput {
  medium: OwnerMedium;
  file: File;
  contentType: string;
  /* The library item's type: "reel" on Shorts, "podcast" on Home. */
  itemType: string;
  title: string;
  description: string;
  cover: File | null;
}

/* What a failed attempt already did, kept for Try again with the same file:
   the measured file, the uploaded object, the hidden item. A new file starts
   over. */
interface Progress {
  file: File;
  probe?: MediaProbe;
  hashes?: MediaHashes;
  claim?: UploadClaim;
  grant?: UploadGrant;
  uploaded?: boolean;
  item?: OwnerLibraryItem;
  registered?: { title: string; description: string };
}

type Stage = "checking" | "uploading" | "registering" | "finishing";

function failureLine(error: unknown, stage: Stage): string {
  if (error instanceof StorageUploadError) return PUBLISH_COPY.uploadStopped;
  if (stage === "checking" && !isAxiosError(error)) return PUBLISH_COPY.unreadable;
  const status = isAxiosError(error) ? error.response?.status : undefined;
  if (status === 413 || status === 415) return PUBLISH_COPY.refusedFile;
  return PUBLISH_COPY.notPosted;
}

/* Measure, hash, grant, PUT with progress, register hidden with today's date,
   then the cover and enabled=true in one PATCH (ROUND49 B.1-B.2). Nothing is
   shown on Shorts or Home before that last step succeeds. */
export function useOwnerPublish(onSignedOut: () => void) {
  const [step, setStep] = useState<PublishStep>("idle");
  const [percent, setPercent] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const progress = useRef<Progress | null>(null);

  const reset = useCallback(() => {
    progress.current = null;
    setStep("idle");
    setPercent(0);
    setFailure(null);
  }, []);

  const publish = useCallback(async (input: PublishInput) => {
    // The stored session is checked before any call (ownerSession.ts).
    if (!ownerSessionUsable()) {
      onSignedOut();
      return;
    }
    if (progress.current?.file !== input.file) progress.current = { file: input.file };
    const kept = progress.current;
    let stage: Stage = "checking";
    setFailure(null);
    try {
      if (!kept.item) {
        if (!kept.uploaded || !kept.grant || !kept.claim) {
          setStep("checking");
          kept.probe ??= await probeMedia(input.file, input.medium);
          kept.hashes ??= await hashMediaFile(input.file);
          const claim: UploadClaim = {
            content_type: input.contentType,
            size_bytes: input.file.size,
            sha256: kept.hashes.sha256,
            content_md5: kept.hashes.contentMd5,
            duration_seconds: kept.probe.durationSeconds,
            original_filename: originalFilename(input.file),
            ...(input.medium === "video" && kept.probe.width && kept.probe.height
              ? { width: kept.probe.width, height: kept.probe.height }
              : {}),
          };
          const grant = await requestUploadGrant(input.medium, claim);
          kept.claim = claim;
          kept.grant = grant;

          stage = "uploading";
          setPercent(0);
          setStep("uploading");
          await putToStorage(grant, input.file, (loaded, total) => {
            setPercent(total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 0);
          });
          kept.uploaded = true;
        }

        stage = "registering";
        setStep("publishing");
        kept.item = await registerItem(input.medium, {
          grant: kept.grant,
          claim: kept.claim,
          type: input.itemType,
          title: input.title,
          description: input.description,
        });
        kept.registered = { title: input.title, description: input.description };
      }

      stage = "finishing";
      setStep("publishing");
      // A title or description edited after a failed last step goes with it.
      const changes: Record<string, string> = {};
      if (kept.registered && input.title !== kept.registered.title) changes.title = input.title;
      if (kept.registered && input.description !== kept.registered.description) changes.description = input.description;
      await finishItem(kept.item.id, input.cover, changes);
      progress.current = null;
      setStep("done");
    } catch (error) {
      // A failed PUT asks for a new grant next time (the old one writes once).
      // A refused registration uploads again; a lost answer only registers again.
      if (stage === "uploading") kept.uploaded = false;
      if (stage === "registering" && isAxiosError(error) && error.response && error.response.status < 500) {
        kept.uploaded = false;
      }
      setFailure(failureLine(error, stage));
      setStep("failed");
    }
  }, [onSignedOut]);

  return { step, percent, failure, publish, reset };
}

export type OwnerPublish = ReturnType<typeof useOwnerPublish>;

export function publishStatus(step: PublishStep, percent: number): string | null {
  if (step === "checking") return PUBLISH_COPY.checking;
  if (step === "uploading") return PUBLISH_COPY.uploading(percent);
  if (step === "publishing") return PUBLISH_COPY.publishing;
  return null;
}

export const publishBusy = (step: PublishStep) => step === "checking" || step === "uploading" || step === "publishing";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { hashFile } from "./fileHashes";
import {
  attachLibraryCover,
  createAudioUploadGrant,
  createLibraryItem,
  listLibraryItems,
  type AudioUploadGrant,
  type LibraryAdminItem,
} from "./libraryAdminApi";
import styles from "./LibraryAdminPage.module.css";

const AUDIO_CONTENT_TYPE = "audio/mpeg" as const;
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type UploadPhase =
  | "idle"
  | "metadata"
  | "hashing"
  | "presigning"
  | "uploading"
  | "finalising"
  | "done";

class DirectUploadError extends Error {
  constructor(
    readonly status: number | "NETWORK",
    readonly responseBody: string,
  ) {
    super("The direct storage upload failed.");
  }
}

const orderNewestFirst = (items: LibraryAdminItem[]) =>
  [...items].sort((left, right) => {
    const byCreated = Date.parse(right.created_at) - Date.parse(left.created_at);
    return Number.isNaN(byCreated) || byCreated === 0 ? right.id - left.id : byCreated;
  });

const responseBodyText = (body: unknown) => {
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
};

const displayError = (error: unknown) => {
  if (error instanceof DirectUploadError) {
    return `Status: ${error.status}\nResponse body:\n${error.responseBody || "(empty)"}`;
  }
  if (isAxiosError(error)) {
    const status = error.response?.status ?? "NETWORK";
    const body = error.response
      ? responseBodyText(error.response.data)
      : error.message;
    return `Status: ${status}\nResponse body:\n${body || "(empty)"}`;
  }
  return `Status: CLIENT\nResponse body:\n${error instanceof Error ? error.message : String(error)}`;
};

const readAudioDuration = (file: File) =>
  new Promise<number>((resolve, reject) => {
    const audio = document.createElement("audio");
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
      audio.remove();
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("The MP3 metadata did not contain a valid duration."));
        return;
      }
      resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("The browser could not read audio metadata from this MP3."));
    };
    audio.src = objectUrl;
  });

const headerValue = (headers: Record<string, string>, wantedName: string) => {
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === wantedName.toLowerCase(),
  );
  return entry?.[1];
};

const putAudioFile = (
  grant: AudioUploadGrant,
  file: File,
  onProgress: (loaded: number, total: number) => void,
) =>
  new Promise<void>((resolve, reject) => {
    if (grant.method !== "PUT") {
      reject(new Error(`Unexpected direct-upload method: ${grant.method}`));
      return;
    }

    const request = new XMLHttpRequest();
    request.open(grant.method, grant.upload_url, true);
    request.timeout = 0;
    Object.entries(grant.headers).forEach(([name, value]) => {
      request.setRequestHeader(name, value);
    });
    request.upload.onprogress = (event) => {
      onProgress(event.loaded, event.lengthComputable ? event.total : file.size);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(file.size, file.size);
        resolve();
        return;
      }
      reject(new DirectUploadError(request.status, request.responseText));
    };
    request.onerror = () => {
      reject(
        new DirectUploadError(
          "NETWORK",
          "The browser received no response. This is commonly an R2 CORS rejection.",
        ),
      );
    };
    request.onabort = () => reject(new DirectUploadError("NETWORK", "Upload aborted."));
    request.send(file);
  });

const formatDuration = (seconds: number) => {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
};

const phaseLabel: Record<UploadPhase, string> = {
  idle: "Ready",
  metadata: "Reading MP3 metadata",
  hashing: "Calculating checksums",
  presigning: "Requesting upload grant",
  uploading: "Uploading directly to storage",
  finalising: "Publishing the library item",
  done: "Published",
};

export default function LibraryAdminPage() {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<LibraryAdminItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("meditation");
  const [sortOrder, setSortOrder] = useState("0");
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [hashProgress, setHashProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [coverBusyId, setCoverBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    setError(null);
    try {
      setItems(orderNewestFirst(await listLibraryItems()));
    } catch (loadError) {
      setError(displayError(loadError));
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const busy = phase !== "idle" && phase !== "done";

  const chooseAudio = (file: File | null) => {
    setError(null);
    setNotice(null);
    setPhase("idle");
    setHashProgress(0);
    setUploadProgress(0);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".mp3") || (file.type && file.type !== AUDIO_CONTENT_TYPE)) {
      setSelectedFile(null);
      setError("Status: CLIENT\nResponse body:\nChoose an MP3 file with audio/mpeg content type.");
      if (audioInputRef.current) audioInputRef.current.value = "";
      return;
    }
    setSelectedFile(file);
    if (!title.trim()) setTitle(file.name.replace(/\.mp3$/i, ""));
  };

  const submitAudio = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!selectedFile) {
      setError("Status: CLIENT\nResponse body:\nChoose an MP3 before uploading.");
      return;
    }
    if (!title.trim() || !type.trim()) {
      setError("Status: CLIENT\nResponse body:\nTitle and type are required.");
      return;
    }
    const parsedSortOrder = Number(sortOrder);
    if (!Number.isInteger(parsedSortOrder)) {
      setError("Status: CLIENT\nResponse body:\nSort order must be a whole number.");
      return;
    }

    try {
      setPhase("metadata");
      const durationSeconds = await readAudioDuration(selectedFile);
      const durationText = String(durationSeconds);
      setPhase("hashing");
      const hashes = await hashFile(selectedFile, (completed, total) => {
        setHashProgress(total > 0 ? (completed / total) * 100 : 0);
      });

      setPhase("presigning");
      const grant = await createAudioUploadGrant({
        content_type: AUDIO_CONTENT_TYPE,
        size_bytes: selectedFile.size,
        sha256: hashes.sha256,
        content_md5: hashes.contentMd5,
        duration_seconds: durationSeconds,
        original_filename: selectedFile.name,
      });
      const signedDuration = headerValue(grant.headers, "x-amz-meta-duration-seconds");
      if (signedDuration === undefined || signedDuration !== durationText) {
        throw new Error("The upload grant did not preserve the measured duration byte-for-byte.");
      }

      setPhase("uploading");
      await putAudioFile(grant, selectedFile, (loaded, total) => {
        setUploadProgress(total > 0 ? (loaded / total) * 100 : 0);
      });

      setPhase("finalising");
      const finalisation = new FormData();
      finalisation.append("audio_key", grant.object_key);
      finalisation.append("audio_content_type", AUDIO_CONTENT_TYPE);
      finalisation.append("audio_size_bytes", String(selectedFile.size));
      finalisation.append("audio_sha256", hashes.sha256);
      finalisation.append("audio_md5", hashes.contentMd5);
      finalisation.append("duration_seconds", signedDuration);
      finalisation.append("audio_original_filename", selectedFile.name);
      finalisation.append("type", type.trim());
      finalisation.append("title", title.trim());
      finalisation.append("description", "");
      finalisation.append("sort_order", String(parsedSortOrder));
      finalisation.append("enabled", "true");
      finalisation.append("published_at", new Date().toISOString());
      const created = await createLibraryItem(finalisation);

      setItems((current) => orderNewestFirst([created, ...current]));
      setPhase("done");
      setNotice(`Published “${created.title}” as library item ${created.id}.`);
      setSelectedFile(null);
      setTitle("");
      setHashProgress(0);
      setUploadProgress(100);
      if (audioInputRef.current) audioInputRef.current.value = "";
    } catch (uploadError) {
      setPhase("idle");
      setError(displayError(uploadError));
    }
  };

  const attachCover = async (item: LibraryAdminItem, file: File | null) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    if (!COVER_TYPES.has(file.type)) {
      setError("Status: CLIENT\nResponse body:\nChoose a JPEG, PNG or WebP cover image.");
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setError("Status: CLIENT\nResponse body:\nCover images must be 8 MB or smaller. Nothing was sent.");
      return;
    }

    setCoverBusyId(item.id);
    try {
      const coverForm = new FormData();
      coverForm.append("cover_image", file, file.name);
      const updated = await attachLibraryCover(item.id, coverForm);
      setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setNotice(`Cover updated for “${updated.title}”.`);
    } catch (coverError) {
      setError(displayError(coverError));
    } finally {
      setCoverBusyId(null);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Sanctuary operations</p>
          <h1 className={styles.title}>Library</h1>
          <p className={styles.intro}>Upload public audio and keep its cover artwork current.</p>
        </div>
        <button className={styles.refreshButton} type="button" onClick={() => void loadItems()} disabled={loadingItems || busy}>
          Refresh library
        </button>
      </header>

      {error && <pre className={styles.error} role="alert">{error}</pre>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      <form className={styles.uploadPanel} onSubmit={submitAudio}>
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.panelKicker}>Direct to storage</p>
            <h2 className={styles.panelTitle}>Add audio</h2>
          </div>
          <span className={styles.phaseBadge}>{phaseLabel[phase]}</span>
        </div>

        <div className={styles.formGrid}>
          <label className={styles.fileField}>
            <span className={styles.fieldLabel}>MP3 file</span>
            <input
              ref={audioInputRef}
              className={styles.fileInput}
              type="file"
              accept=".mp3,audio/mpeg"
              disabled={busy}
              onChange={(event) => chooseAudio(event.currentTarget.files?.[0] ?? null)}
            />
            <span className={styles.fileHint}>{selectedFile ? `${selectedFile.name} · ${selectedFile.size.toLocaleString()} bytes` : "One audio/mpeg file at a time"}</span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Title</span>
            <input className={styles.textInput} value={title} maxLength={100} disabled={busy} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Type</span>
            <input className={styles.textInput} value={type} list="library-type-suggestions" maxLength={80} disabled={busy} onChange={(event) => setType(event.target.value)} />
            <datalist id="library-type-suggestions">
              <option value="meditation" />
              <option value="podcast" />
              <option value="music" />
            </datalist>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Sort order</span>
            <input className={styles.textInput} type="number" step="1" value={sortOrder} disabled={busy} onChange={(event) => setSortOrder(event.target.value)} />
          </label>
        </div>

        <p className={styles.corsNote}>
          Known limitation: the direct upload can report a CORS/network error until the R2 bucket allows PUT requests from askvalentina.co.uk.
        </p>

        {(phase === "hashing" || hashProgress > 0) && (
          <div className={styles.progressGroup}>
            <div className={styles.progressLabels}><span>Checksums</span><span>{Math.round(hashProgress)}%</span></div>
            <div className={styles.progressTrack} role="progressbar" aria-label="Checksum progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hashProgress)}>
              <span className={styles.progressFill} style={{ width: `${hashProgress}%` }} />
            </div>
          </div>
        )}

        {(phase === "uploading" || phase === "finalising" || uploadProgress > 0) && (
          <div className={styles.progressGroup}>
            <div className={styles.progressLabels}><span>Storage upload</span><span>{Math.round(uploadProgress)}%</span></div>
            <div className={styles.progressTrack} role="progressbar" aria-label="Storage upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(uploadProgress)}>
              <span className={styles.progressFill} style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        <button className={styles.submitButton} type="submit" disabled={busy || !selectedFile}>
          {busy ? phaseLabel[phase] : "Upload and publish"}
        </button>
      </form>

      <section className={styles.listPanel} aria-labelledby="library-items-title">
        <div className={styles.listHeading}>
          <div>
            <p className={styles.panelKicker}>Newest first</p>
            <h2 className={styles.panelTitle} id="library-items-title">Library items</h2>
          </div>
          <span className={styles.countBadge}>{items.length}</span>
        </div>

        {loadingItems ? (
          <p className={styles.emptyState}>Loading library items…</p>
        ) : items.length === 0 ? (
          <p className={styles.emptyState}>No library items yet.</p>
        ) : (
          <div className={styles.itemList}>
            {items.map((item) => (
              <article className={styles.itemCard} key={item.id}>
                <div className={styles.coverSlot}>
                  {item.cover_url ? (
                    <img className={styles.coverImage} src={item.cover_url} alt="" />
                  ) : (
                    <span className={styles.coverPlaceholder}>No cover</span>
                  )}
                </div>
                <div className={styles.itemCopy}>
                  <div className={styles.itemTopline}>
                    <span className={styles.typeBadge}>{item.type}</span>
                    <span className={item.enabled ? styles.enabledBadge : styles.disabledBadge}>{item.enabled ? "Enabled" : "Disabled"}</span>
                  </div>
                  <h3 className={styles.itemTitle}>{item.title}</h3>
                  <dl className={styles.itemFacts}>
                    <div className={styles.fact}><dt className={styles.factTerm}>Duration</dt><dd className={styles.factValue}>{formatDuration(item.duration_seconds)}</dd></div>
                    <div className={styles.fact}><dt className={styles.factTerm}>Cover</dt><dd className={styles.factValue}>{item.cover_url ? "Attached" : "Missing"}</dd></div>
                    <div className={styles.fact}><dt className={styles.factTerm}>Created</dt><dd className={styles.factValue}>{new Date(item.created_at).toLocaleString()}</dd></div>
                  </dl>
                </div>
                <label className={styles.coverAction}>
                  <span>{coverBusyId === item.id ? "Uploading cover…" : item.cover_url ? "Replace cover" : "Attach cover"}</span>
                  <input
                    className={styles.hiddenFileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    disabled={coverBusyId !== null || busy}
                    onChange={(event) => {
                      const input = event.currentTarget;
                      void attachCover(item, input.files?.[0] ?? null).finally(() => {
                        input.value = "";
                      });
                    }}
                  />
                </label>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

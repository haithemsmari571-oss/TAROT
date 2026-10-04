import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { dayOf } from "@/features/client-app/ukTime";
import { joinCaption, plainLines, splitCaption } from "./ownerCaption";
import { OwnerHomePreview, OwnerShortsPreview } from "./OwnerClientPreview";
import { deleteItem, updateItem, type OwnerLibraryItem } from "./ownerLibraryApi";
import { kindLabel } from "./ownerMedia";
import { OwnerAudioPreview, OwnerBack, OwnerCaptionBox, OwnerConfirm, OwnerPostBadges } from "./OwnerParts";
import { OWNER_PATH } from "./ownerPaths";
import { audioUrlOf, coverUrlOf, firstFrameUrl, OWNER_POSTS_QUERY_KEY, replacePost, useOwnerPosts, videoUrlOf } from "./ownerPosts";

const COPY = {
  loading: "Loading…",
  failed: "This post could not be loaded.",
  tryAgain: "Try again",
  missing: "This post is not here any more.",
  posted: (day: string) => `Posted ${day}`,
  preview: "How clients see it",
  save: "Save",
  saving: "Saving…",
  saved: "Saved.",
  notSaved: "It did not save. Try again.",
  show: "Show in the app",
  shown: "Clients can see this post.",
  hidden: "Hidden. Clients cannot see this post.",
  notSwitched: "It did not change. Try again.",
  delete: "Delete post",
  deleteHeading: "Delete this post?",
  deleteLine: "It is removed for everyone and cannot be brought back.",
  deleteConfirm: "Delete",
  keep: "Keep it",
  notDeleted: "It did not delete. Try again.",
} as const;

type Work = "idle" | "busy" | "done" | "failed";

/* One of "Your posts" (ROUND51): how clients see it, its caption to edit
   under the same first-line rule as a new post, a switch to hide or show it,
   and Delete after a confirm step. */
export default function OwnerPostScreen() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const posts = useOwnerPosts();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState<Work>("idle");
  const [switching, setSwitching] = useState<Work>("idle");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState<Work>("idle");

  const item = posts.data?.find((post) => String(post.id) === postId) ?? null;

  if (!item) {
    return (
      <main className="owner-screen owner-post">
        <OwnerBack />
        {posts.isPending && <p className="owner-note" role="status">{COPY.loading}</p>}
        {posts.isError && (
          <div className="owner-posts-state">
            <p className="owner-error" role="alert">{COPY.failed}</p>
            <button type="button" className="owner-button-quiet" onClick={() => { void posts.refetch(); }}>{COPY.tryAgain}</button>
          </div>
        )}
        {posts.isSuccess && <p className="owner-note">{COPY.missing}</p>}
      </main>
    );
  }

  const caption = draft ?? joinCaption(item.title, item.description);
  const { title, description } = splitCaption(caption);
  const changed = title !== item.title || description !== plainLines(item.description);
  const video = videoUrlOf(item);
  const audio = audioUrlOf(item);
  const cover = coverUrlOf(item);

  const edit = (value: string) => {
    setDraft(value);
    setSaving("idle");
  };

  const settle = (updated: OwnerLibraryItem) => replacePost(queryClient, updated);

  const save = async () => {
    setSaving("busy");
    try {
      settle(await updateItem(item.id, { title, description }));
      setDraft(null);
      setSaving("done");
    } catch {
      setSaving("failed");
    }
  };

  const switchShown = async () => {
    setSwitching("busy");
    try {
      settle(await updateItem(item.id, { enabled: !item.enabled }));
      setSwitching("idle");
    } catch {
      setSwitching("failed");
    }
  };

  const remove = async () => {
    setDeleting("busy");
    try {
      await deleteItem(item.id);
    } catch {
      // The row can be gone even when its files could not be cleared: the
      // list says whether the post is still there.
      const fresh = await posts.refetch();
      if (fresh.data?.some((post) => post.id === item.id)) {
        setDeleting("failed");
        return;
      }
    }
    queryClient.setQueryData<OwnerLibraryItem[]>(OWNER_POSTS_QUERY_KEY, (list) => list?.filter((post) => post.id !== item.id));
    navigate(OWNER_PATH, { replace: true });
  };

  return (
    <main className="owner-screen owner-post" data-owner-post={item.id}>
      <OwnerBack />
      <h1 className="owner-title">{kindLabel(item.type)}</h1>
      <div className="owner-post-meta">
        <OwnerPostBadges type={item.type} enabled={item.enabled} />
        <span className="owner-note">{COPY.posted(dayOf(item.published_at ?? item.created_at))}</span>
      </div>
      {confirmingDelete ? (
        <OwnerConfirm
          heading={COPY.deleteHeading}
          line={COPY.deleteLine}
          confirmLabel={COPY.deleteConfirm}
          cancelLabel={COPY.keep}
          busy={deleting === "busy"}
          error={deleting === "failed" ? COPY.notDeleted : null}
          onConfirm={() => { void remove(); }}
          onCancel={() => {
            setConfirmingDelete(false);
            setDeleting("idle");
          }}
        />
      ) : (
        <section className="owner-panel owner-form">
          <div className="owner-preview-block">
            <span className="owner-label">{COPY.preview}</span>
            {video ? (
              <OwnerShortsPreview videoUrl={cover ? video : firstFrameUrl(video)} posterUrl={cover} title={title} description={description} />
            ) : (
              <>
                {audio && <OwnerAudioPreview url={audio} />}
                <OwnerHomePreview
                  type={item.type}
                  title={title}
                  description={description}
                  coverUrl={cover}
                  durationSeconds={item.duration_seconds}
                  publishedAt={item.published_at ?? item.created_at}
                />
              </>
            )}
          </div>
          <OwnerCaptionBox value={caption} disabled={saving === "busy"} onChange={edit} />
          <button type="button" className="owner-button" onClick={() => { void save(); }} disabled={!changed || title === "" || saving === "busy"}>
            {saving === "busy" ? COPY.saving : COPY.save}
          </button>
          {saving === "done" && <p className="owner-status" role="status">{COPY.saved}</p>}
          {saving === "failed" && <p className="owner-error" role="alert">{COPY.notSaved}</p>}
          <button
            type="button"
            role="switch"
            aria-checked={item.enabled}
            className="owner-switch-row"
            onClick={() => { void switchShown(); }}
            disabled={switching === "busy"}
          >
            <span className="owner-switch-copy">
              <span className="owner-switch-label">{COPY.show}</span>
              <span className="owner-switch-line">{item.enabled ? COPY.shown : COPY.hidden}</span>
            </span>
            <span className="owner-switch" aria-hidden="true"><span className="owner-switch-knob" /></span>
          </button>
          {switching === "failed" && <p className="owner-error" role="alert">{COPY.notSwitched}</p>}
          <button type="button" className="owner-button-quiet owner-delete" onClick={() => setConfirmingDelete(true)}>
            {COPY.delete}
          </button>
        </section>
      )}
    </main>
  );
}

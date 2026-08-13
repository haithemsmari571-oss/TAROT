import { useState } from "react";
import { onboardingApi, type OnboardingBatch, type OnboardingDraft } from "../api/onboardingApi";

// Bulk psychic onboarding (create-first-then-review, no AI). The operator uploads
// a manifest CSV + image files, reviews/fixes the matched rows, then confirms to
// create real (offline) psychic accounts.
export default function PsychicOnboarding() {
  const [manifest, setManifest] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [bioFiles, setBioFiles] = useState<File[]>([]);
  const [batch, setBatch] = useState<OnboardingBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  const refresh = async (batchId: string) => setBatch(await onboardingApi.getBatch(batchId));

  const onStage = async () => {
    if (!manifest || images.length === 0) {
      setError("Choose a manifest CSV and at least one image.");
      return;
    }
    setBusy(true);
    setError(null);
    setConfirmMsg(null);
    try {
      setBatch(await onboardingApi.stage(manifest, images, bioFiles));
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setError(err.response?.data?.detail || err.message || "Staging failed.");
    } finally {
      setBusy(false);
    }
  };

  const onEdit = async (draft: OnboardingDraft, fields: Partial<OnboardingDraft>) => {
    try {
      await onboardingApi.updateDraft(draft.id, fields);
      if (batch) await refresh(batch.batch_id);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err.response?.data?.detail || "Edit failed.");
    }
  };

  const onConfirm = async () => {
    if (!batch) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onboardingApi.confirm(batch.batch_id);
      setConfirmMsg(`Created ${result.created} psychic(s) (offline). Skipped ${result.skipped}, failed ${result.failed}.`);
      await refresh(batch.batch_id);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err.response?.data?.detail || "Confirm failed.");
    } finally {
      setBusy(false);
    }
  };

  const statusColor = (s: OnboardingDraft["status"]) =>
    s === "created" ? "#16a34a" : s === "error" ? "#dc2626" : s === "skipped" ? "#a1a1aa" : "#2563eb";

  return (
    <div style={{ padding: 24, color: "#e5e5e5" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Bulk psychic onboarding</h1>
      <p style={{ opacity: 0.7, marginBottom: 20, maxWidth: 720 }}>
        Upload a manifest CSV (columns: <code>image_filename, display_name, price_per_minute, bio</code>) plus the
        image files. Long bios can live in <code>.txt</code> files referenced by a <code>bio_filename</code> column.
        Nothing is created until you review and confirm — new psychics are created <strong>offline</strong>.
      </p>

      <div style={{ display: "grid", gap: 14, maxWidth: 560, marginBottom: 20 }}>
        <label>Manifest CSV
          <input type="file" accept=".csv,text/csv" onChange={(e) => setManifest(e.target.files?.[0] ?? null)} />
        </label>
        <label>Images ({images.length} selected)
          <input type="file" accept="image/*" multiple onChange={(e) => setImages(Array.from(e.target.files ?? []))} />
        </label>
        <label>Bio text files (optional, {bioFiles.length})
          <input type="file" accept=".txt" multiple onChange={(e) => setBioFiles(Array.from(e.target.files ?? []))} />
        </label>
        <button onClick={onStage} disabled={busy} style={{ padding: "10px 16px", fontWeight: 700 }}>
          {busy ? "Working…" : "Stage & review"}
        </button>
      </div>

      {error && <div style={{ color: "#dc2626", marginBottom: 12 }}>{error}</div>}
      {confirmMsg && <div style={{ color: "#16a34a", marginBottom: 12 }}>{confirmMsg}</div>}

      {batch && (
        <div>
          <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 12 }}>
            <span>Total: <strong>{batch.total}</strong></span>
            <span style={{ color: "#2563eb" }}>Ready: {batch.ready}</span>
            <span style={{ color: "#dc2626" }}>Errors: {batch.errors}</span>
            <span style={{ color: "#16a34a" }}>Created: {batch.created}</span>
            <button onClick={onConfirm} disabled={busy || batch.ready === 0} style={{ marginLeft: "auto", padding: "8px 16px", fontWeight: 700 }}>
              Create {batch.ready} psychic{batch.ready === 1 ? "" : "s"}
            </button>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.6 }}>
                <th style={{ padding: 6 }}>Photo</th>
                <th>Name</th>
                <th>£/min</th>
                <th>Bio</th>
                <th>Username / Email</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {batch.drafts.map((d) => (
                <tr key={d.id} style={{ borderTop: "1px solid #333" }}>
                  <td style={{ padding: 6 }}>
                    {d.preview_url
                      ? <img src={d.preview_url} alt={d.display_name ?? ""} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6 }} />
                      : <span style={{ opacity: 0.5 }}>{d.image_filename || "—"}</span>}
                  </td>
                  <td>
                    <input defaultValue={d.display_name ?? ""} disabled={d.status === "created"}
                      onBlur={(e) => e.target.value !== (d.display_name ?? "") && onEdit(d, { display_name: e.target.value })}
                      style={{ width: 130 }} />
                  </td>
                  <td>
                    <input type="number" step="0.5" defaultValue={d.price_per_minute ?? ""} disabled={d.status === "created"}
                      onBlur={(e) => Number(e.target.value) !== d.price_per_minute && onEdit(d, { price_per_minute: Number(e.target.value) })}
                      style={{ width: 70 }} />
                  </td>
                  <td>
                    <textarea defaultValue={d.bio ?? ""} disabled={d.status === "created"}
                      onBlur={(e) => e.target.value !== (d.bio ?? "") && onEdit(d, { bio: e.target.value })}
                      style={{ width: 220, height: 40 }} />
                  </td>
                  <td style={{ fontSize: 11, opacity: 0.8 }}>{d.username}<br />{d.email}</td>
                  <td>
                    <span style={{ color: statusColor(d.status), fontWeight: 700 }}>{d.status}</span>
                    {d.error_reason && <div style={{ color: "#dc2626", fontSize: 11 }}>{d.error_reason}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

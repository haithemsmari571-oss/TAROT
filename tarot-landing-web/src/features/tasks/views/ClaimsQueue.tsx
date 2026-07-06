import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { useToast } from "../../../components/Toast";
import { tasksApi } from "../api/tasksApi";
import type { Claim } from "../types/task.types";

const errMsg = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.response?.data?.detail || err?.message || fallback;

const apiBase = (import.meta.env.VITE_API_URL ?? "") as string;

// Evidence is stored as "/uploads/<file>" and served at /api/media/uploads/<file>.
// A full URL (older data) is used as-is; handles are shown as text instead.
const evidenceSrc = (path: string | null): string | null => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiBase}/api/media${path}`;
};

const timeAgo = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
};

const ClaimsQueue = () => {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejecting, setRejecting] = useState<Claim | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    fetchClaims();
  }, []);

  const fetchClaims = async () => {
    try {
      setLoading(true);
      const data = await tasksApi.listClaims("PENDING");
      setClaims(data);
      setSelected(new Set());
    } catch (err: any) {
      toast.error(errMsg(err, "Failed to load claims."));
    } finally {
      setLoading(false);
    }
  };

  const removeClaim = (id: number) =>
    setClaims((prev) => prev.filter((c) => c.id !== id));

  const handleApprove = async (claim: Claim) => {
    try {
      setBusy(true);
      await tasksApi.approveClaim(claim.id);
      removeClaim(claim.id);
      toast.success(`Approved — ${claim.task_reward ?? ""}⭐ sent to ${claim.username}.`);
    } catch (err: any) {
      toast.error(errMsg(err, "Could not approve."));
    } finally {
      setBusy(false);
    }
  };

  const submitReject = async () => {
    if (!rejecting) return;
    try {
      setBusy(true);
      await tasksApi.rejectClaim(rejecting.id, rejectReason.trim() || undefined);
      removeClaim(rejecting.id);
      toast.success("Claim rejected.");
      setRejecting(null);
      setRejectReason("");
    } catch (err: any) {
      toast.error(errMsg(err, "Could not reject."));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    try {
      setBusy(true);
      const ids = Array.from(selected);
      const res = await tasksApi.bulkApprove(ids);
      setClaims((prev) => prev.filter((c) => !res.approved.includes(c.id)));
      setSelected(new Set());
      toast.success(
        `Approved ${res.approved.length} claim(s)` +
          (res.skipped.length ? `, ${res.skipped.length} skipped.` : ".")
      );
    } catch (err: any) {
      toast.error(errMsg(err, "Bulk approve failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-12 min-h-screen" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      {/* Header */}
      <div className="mb-10 flex justify-between items-end">
        <div>
          <h1 style={TYPOGRAPHY.headings.h2} className="uppercase italic tracking-tighter">
            Claims <span style={{ color: COLORS.primary }}>Queue</span>
          </h1>
          <p style={{ color: COLORS.neutralGray }} className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-50">
            Review social tasks — approve to send Stardust instantly
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchClaims}
            className="h-11 px-5 rounded-xl border border-white/10 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
          >
            <Icon icon="solar:refresh-bold" /> Refresh
          </button>
          <span className="text-white/10 font-black text-[9px] uppercase tracking-widest">
            Pending: {claims.length}
          </span>
        </div>
      </div>

      {/* Bulk bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 rounded-2xl flex items-center justify-between border"
            style={{ backgroundColor: `${COLORS.primary}12`, borderColor: `${COLORS.primary}30` }}
          >
            <span className="text-xs font-bold uppercase tracking-widest text-white/70">
              {selected.size} selected
            </span>
            <button
              onClick={handleBulkApprove}
              disabled={busy}
              className="h-10 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest disabled:opacity-50"
              style={{ backgroundColor: COLORS.success, color: COLORS.dark }}
            >
              Approve selected
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      {loading ? (
        <div className="py-32 flex flex-col items-center gap-4">
          <Icon icon="solar:inbox-bold-duotone" className="text-5xl text-primary animate-pulse" />
          <span className="text-white/50 text-sm uppercase tracking-widest">Loading…</span>
        </div>
      ) : claims.length === 0 ? (
        <div className="py-32 flex flex-col items-center gap-4">
          <Icon icon="solar:check-circle-bold-duotone" className="text-6xl" style={{ color: COLORS.success }} />
          <span className="text-white/60 text-sm uppercase tracking-widest font-bold">
            All caught up — no claims to review
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {claims.map((claim) => {
            const rawPaths =
              claim.evidence_paths && claim.evidence_paths.length
                ? claim.evidence_paths
                : claim.evidence_path
                ? [claim.evidence_path]
                : [];
            const images = rawPaths.map(evidenceSrc).filter(Boolean) as string[];
            const src = images[0] || null;
            const isSelected = selected.has(claim.id);
            return (
              <motion.div
                key={claim.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="rounded-[28px] border overflow-hidden flex flex-col"
                style={{
                  backgroundColor: COLORS.surface,
                  borderColor: isSelected ? COLORS.primary : "rgba(255,255,255,0.06)",
                }}
              >
                {/* Evidence preview */}
                <div className="relative h-40 flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
                  {src ? (
                    <img
                      src={src}
                      alt="evidence"
                      className="w-full h-full object-cover cursor-zoom-in"
                      onClick={() => setLightbox(src)}
                      title="Tap to view full"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : claim.evidence_handle ? (
                    <div className="flex flex-col items-center gap-2">
                      <Icon icon="skill-icons:instagram" className="text-3xl" />
                      <span className="text-sm font-bold text-white">{claim.evidence_handle}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 opacity-40">
                      <Icon icon="solar:gallery-bold-duotone" className="text-3xl text-white" />
                      <span className="text-[10px] uppercase tracking-widest text-white/50">No evidence</span>
                    </div>
                  )}

                  {/* Select checkbox */}
                  <button
                    onClick={() => toggle(claim.id)}
                    className="absolute top-3 left-3 w-7 h-7 rounded-lg border-2 flex items-center justify-center backdrop-blur"
                    style={{
                      borderColor: isSelected ? COLORS.primary : "rgba(255,255,255,0.4)",
                      backgroundColor: isSelected ? COLORS.primary : "rgba(0,0,0,0.4)",
                    }}
                  >
                    {isSelected && <Icon icon="solar:check-read-bold" className="text-dark text-sm" />}
                  </button>

                  <span
                    className="absolute top-3 right-3 text-[10px] font-black px-3 py-1 rounded-lg"
                    style={{ backgroundColor: `${COLORS.starGold}20`, color: COLORS.starGold }}
                  >
                    ⭐ {claim.task_reward}
                  </span>

                  {images.length > 1 && (
                    <span
                      className="absolute bottom-3 right-3 text-[10px] font-black px-2 py-1 rounded-lg"
                      style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}
                    >
                      {images.length} photos
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-5 flex-1 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Icon icon="solar:user-circle-bold-duotone" className="text-lg text-primary" />
                    <span className="text-sm font-bold text-white">{claim.username || `#${claim.user_id}`}</span>
                    <span className="text-[10px] text-white/30 ml-auto">{timeAgo(claim.submitted_at)}</span>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">{claim.task_title}</p>

                  {/* Extra image thumbnails (tap to view full) */}
                  {images.length > 1 && (
                    <div className="flex gap-2 flex-wrap">
                      {images.map((img, i) => (
                        <img
                          key={i}
                          src={img}
                          alt={`Photo ${i + 1}`}
                          onClick={() => setLightbox(img)}
                          className="w-12 h-12 rounded-lg object-cover cursor-zoom-in"
                          style={{ border: `1px solid ${COLORS.neutralWhite}22` }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Client's note */}
                  {claim.message && (
                    <p
                      className="text-sm italic rounded-lg px-3 py-2"
                      style={{ backgroundColor: `${COLORS.primary}12`, color: `${COLORS.neutralWhite}dd` }}
                    >
                      “{claim.message}”
                    </p>
                  )}

                  {/* Actions */}
                  <div className="mt-auto flex gap-2 pt-2">
                    <button
                      onClick={() => handleApprove(claim)}
                      disabled={busy}
                      className="flex-1 h-11 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-1 disabled:opacity-50"
                      style={{ backgroundColor: COLORS.success, color: COLORS.dark }}
                    >
                      <Icon icon="solar:check-circle-bold" /> Approve
                    </button>
                    <button
                      onClick={() => {
                        setRejecting(claim);
                        setRejectReason("");
                      }}
                      disabled={busy}
                      className="flex-1 h-11 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-1 disabled:opacity-50 border"
                      style={{ color: COLORS.error, borderColor: `${COLORS.error}40`, backgroundColor: `${COLORS.error}12` }}
                    >
                      <Icon icon="solar:close-circle-bold" /> Reject
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Reject reason modal */}
      <AnimatePresence>
        {rejecting && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRejecting(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 20 }}
              className="relative w-full max-w-md rounded-[32px] border border-white/10 p-8"
              style={{ backgroundColor: "rgba(13,13,13,0.95)" }}
            >
              <h3 className="text-xl font-black uppercase italic text-white mb-1">Reject claim</h3>
              <p className="text-[10px] uppercase tracking-widest text-white/30 font-black mb-6">
                {rejecting.username} · {rejecting.task_title}
              </p>
              <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">
                Reason (optional)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full h-24 mt-2 px-4 py-3 rounded-2xl border text-sm resize-none"
                style={{
                  backgroundColor: "rgba(255,255,255,0.02)",
                  borderColor: "rgba(255,255,255,0.06)",
                  color: COLORS.neutralWhite,
                }}
                placeholder="e.g. Tag wasn't visible in the screenshot"
              />
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setRejecting(null)}
                  className="flex-1 h-12 rounded-xl border border-white/10 text-white/60 font-black uppercase text-[10px] tracking-widest"
                >
                  Cancel
                </button>
                <button
                  onClick={submitReject}
                  disabled={busy}
                  className="flex-1 h-12 rounded-xl font-black uppercase text-[10px] tracking-widest disabled:opacity-50"
                  style={{ backgroundColor: COLORS.error, color: "#fff" }}
                >
                  Reject claim
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full-size evidence viewer */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm cursor-zoom-out"
          >
            <img
              src={lightbox}
              alt="evidence full"
              className="max-w-full max-h-full rounded-2xl object-contain"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ClaimsQueue;

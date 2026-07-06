import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { constellationApi } from "../api/constellationApi";
import { compressScreenshot } from "../lib/compressImage";
import BrandedLoader from "../../../components/motion/BrandedLoader";
import type { Ritual } from "../types/constellation.types";

const MAX_IMAGES = 4;
const MSG_CAP = 300;
const MIN_LOADER_MS = 600;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Shot {
  file: File;
  preview: string;
}

interface Props {
  ritual: Ritual;
  onClose: () => void;
  onSubmitted: () => void;
}

const RitualClaimSheet = ({ ritual, onClose, onSubmitted }: Props) => {
  const isHandle = ritual.verification_type === "HANDLE";
  const fileInput = useRef<HTMLInputElement>(null);

  const [shots, setShots] = useState<Shot[]>([]);
  const [prep, setPrep] = useState<{ current: number; total: number } | null>(null);
  const [handle, setHandle] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const addFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-picking the same file
    if (!chosen.length) return;
    const toProcess = chosen.slice(0, MAX_IMAGES - shots.length);
    setNote(null);
    setPrep({ current: 0, total: toProcess.length });
    const started = Date.now();
    try {
      const next: Shot[] = [];
      for (let i = 0; i < toProcess.length; i++) {
        setPrep({ current: i + 1, total: toProcess.length });
        const compressed = await compressScreenshot(toProcess[i]);
        next.push({ file: compressed, preview: URL.createObjectURL(compressed) });
      }
      const elapsed = Date.now() - started;
      if (elapsed < MIN_LOADER_MS) await wait(MIN_LOADER_MS - elapsed);
      setShots((s) => [...s, ...next]);
    } catch {
      setNote("We couldn't read one of those images. Try another photo.");
    } finally {
      setPrep(null);
    }
  };

  const removeShot = (i: number) =>
    setShots((s) => s.filter((_, idx) => idx !== i));

  const canSubmit = isHandle ? handle.trim().length > 0 : shots.length > 0;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setNote(null);
    const started = Date.now();
    try {
      await constellationApi.submitClaim(
        ritual.id,
        isHandle
          ? { handle, message: message.trim() || undefined }
          : { files: shots.map((s) => s.file), message: message.trim() || undefined }
      );
      const elapsed = Date.now() - started;
      if (elapsed < MIN_LOADER_MS) await wait(MIN_LOADER_MS - elapsed);
      onSubmitted();
    } catch (err: any) {
      setNote(err?.response?.data?.message || "Something went wrong — please try again.");
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="relative w-full max-w-md rounded-t-[28px] sm:rounded-[28px] p-6 pb-8 max-h-[92vh] overflow-y-auto"
          style={{ backgroundColor: COLORS.surface, fontFamily: TYPOGRAPHY.fontFamily.body }}
        >
          {/* Submit-in-flight takes over the sheet with a visible loader. */}
          {submitting ? (
            <div className="py-16 flex flex-col items-center justify-center">
              <BrandedLoader label="Sending your offering…" />
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="pr-3">
                  <h3 className="text-xl font-bold" style={{ color: COLORS.neutralWhite }}>
                    {ritual.title}
                  </h3>
                  <p className="text-base mt-1" style={{ color: COLORS.starGold }}>
                    Earn {ritual.reward} ⭐
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${COLORS.neutralWhite}12`, color: COLORS.neutralWhite }}
                >
                  <Icon icon="solar:close-circle-bold" className="text-2xl" />
                </button>
              </div>

              {/* Instructions */}
              <div
                className="rounded-2xl p-4 mb-5 text-base leading-relaxed"
                style={{ backgroundColor: COLORS.dark, color: `${COLORS.neutralWhite}dd` }}
              >
                {ritual.description ||
                  (isHandle
                    ? "Do the ritual, then enter your Instagram handle so we can check it."
                    : "Do the ritual, then add up to 4 screenshots below.")}
              </div>

              {isHandle ? (
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="@yourhandle"
                  className="w-full rounded-2xl px-4 text-base mb-5"
                  style={{
                    height: 56,
                    backgroundColor: COLORS.dark,
                    color: COLORS.neutralWhite,
                    border: `1px solid ${COLORS.neutralWhite}22`,
                  }}
                />
              ) : (
                <div className="mb-5">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    onChange={addFiles}
                    className="hidden"
                  />

                  {/* Thumbnails */}
                  {shots.length > 0 && (
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      {shots.map((s, i) => (
                        <div key={i} className="relative aspect-square">
                          <img
                            src={s.preview}
                            alt={`Screenshot ${i + 1}`}
                            className="w-full h-full rounded-xl object-cover"
                            style={{ border: `1px solid ${COLORS.neutralWhite}22` }}
                          />
                          {/* On-brand remove: dark chip, gold trim, 44px touch area */}
                          <button
                            onClick={() => removeShot(i)}
                            aria-label="Remove photo"
                            className="absolute -top-3 -right-3 flex items-center justify-center"
                            style={{ width: 44, height: 44 }}
                          >
                            <span
                              className="flex items-center justify-center rounded-full"
                              style={{
                                width: 26,
                                height: 26,
                                backgroundColor: "rgba(16,8,22,0.92)",
                                border: `1px solid ${COLORS.starGold}`,
                                color: "#fff",
                              }}
                            >
                              <Icon icon="solar:close-bold" className="text-sm" />
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {prep ? (
                    <div className="rounded-2xl p-6 flex justify-center" style={{ backgroundColor: COLORS.dark }}>
                      <BrandedLoader
                        label={`Preparing photo ${prep.current} of ${prep.total}…`}
                        size={72}
                      />
                    </div>
                  ) : (
                    shots.length < MAX_IMAGES && (
                      <button
                        onClick={() => fileInput.current?.click()}
                        className="w-full rounded-2xl flex flex-col items-center justify-center gap-2"
                        style={{
                          height: shots.length ? 64 : 120,
                          backgroundColor: COLORS.dark,
                          border: `2px dashed ${COLORS.primary}55`,
                          color: COLORS.neutralWhite,
                        }}
                      >
                        <Icon icon="solar:gallery-add-bold-duotone" className="text-3xl" style={{ color: COLORS.primary }} />
                        <span className="text-base font-bold">
                          {shots.length ? "Add another photo" : "Add your screenshot"}
                        </span>
                      </button>
                    )
                  )}
                </div>
              )}

              {/* Optional message */}
              <div className="mb-5">
                <label className="text-sm font-semibold mb-2 block" style={{ color: `${COLORS.neutralWhite}aa` }}>
                  Add a note (optional)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MSG_CAP))}
                  placeholder="e.g. posted it to my story, tagged you!"
                  className="w-full rounded-2xl px-4 py-3 text-base resize-none"
                  rows={2}
                  style={{
                    backgroundColor: COLORS.dark,
                    color: COLORS.neutralWhite,
                    border: `1px solid ${COLORS.neutralWhite}22`,
                  }}
                />
                <p className="text-right text-xs mt-1" style={{ color: `${COLORS.neutralWhite}55` }}>
                  {message.length}/{MSG_CAP}
                </p>
              </div>

              {note && (
                <p className="text-base mb-4" style={{ color: `${COLORS.neutralWhite}aa` }}>
                  {note}
                </p>
              )}

              <button
                onClick={submit}
                disabled={!canSubmit || !!prep}
                className="w-full rounded-2xl font-bold text-base disabled:opacity-50"
                style={{ height: 56, backgroundColor: COLORS.primary, color: COLORS.dark }}
              >
                Submit for confirmation
              </button>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default RitualClaimSheet;

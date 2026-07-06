import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import PrimaryInput from "../CustomInputs/PrimaryInput";
import PrimarySelect from "../CustomInputs/PrimarySelect";
import { COLORS, TYPOGRAPHY } from "../../theme";
import type { Task, TaskFormData } from "../../features/tasks/types/task.types";
import {
  FREQUENCY_OPTIONS,
  STATUS_OPTIONS,
  TRIGGER_OPTIONS,
  VERIFICATION_OPTIONS,
} from "../../features/tasks/types/task.types";

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TaskFormData) => void;
  initialData: Task | null;
  saving?: boolean;
}

// Sensible defaults so a fresh task takes seconds: a manual social task, live,
// once per rotation window, worth 5 Stardust.
const DEFAULTS: TaskFormData = {
  title: "",
  description: "",
  icon: "✨",
  reward: 5,
  verification_type: "SCREENSHOT",
  trigger_event: null,
  frequency: "ONCE_PER_WINDOW",
  status: "ACTIVE",
  starts_at: null,
  ends_at: null,
  rotation_weight: 1,
};

// ISO (with tz) → "YYYY-MM-DDTHH:mm" for <input type=datetime-local>, and back.
const toInput = (iso: string | null): string =>
  iso ? iso.slice(0, 16) : "";
const fromInput = (local: string): string | null =>
  local ? local : null;

const labelCls = "text-[10px] font-black uppercase tracking-widest text-white/40 ml-1";

const TaskModal = ({ isOpen, onClose, onSave, initialData, saving }: TaskModalProps) => {
  const [form, setForm] = useState<TaskFormData>(DEFAULTS);

  useEffect(() => {
    if (initialData) {
      setForm({
        title: initialData.title,
        description: initialData.description ?? "",
        icon: initialData.icon ?? "",
        reward: initialData.reward,
        verification_type: initialData.verification_type,
        trigger_event: initialData.trigger_event,
        frequency: initialData.frequency,
        status: initialData.status,
        starts_at: initialData.starts_at,
        ends_at: initialData.ends_at,
        rotation_weight: initialData.rotation_weight,
      });
    } else {
      setForm(DEFAULTS);
    }
  }, [initialData, isOpen]);

  const isAuto = form.verification_type === "AUTO";
  const isValid =
    form.title.trim().length > 0 &&
    form.reward >= 0 &&
    (!isAuto || !!form.trigger_event);

  const handleSave = () => {
    // Manual tasks never carry a trigger event.
    const payload: TaskFormData = {
      ...form,
      trigger_event: isAuto ? form.trigger_event : null,
    };
    onSave(payload);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />

        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-3xl overflow-hidden rounded-[44px] border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] backdrop-blur-2xl max-h-[90vh] overflow-y-auto"
          style={{ backgroundColor: "rgba(13,13,13,0.85)", fontFamily: TYPOGRAPHY.fontFamily.body }}
        >
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          {/* Header */}
          <div className="px-12 pt-12 pb-8 flex justify-between items-start sticky top-0 bg-[rgba(13,13,13,0.95)] backdrop-blur-xl z-10">
            <div className="flex flex-col gap-1">
              <h3
                className="text-3xl font-black uppercase italic tracking-tighter text-white"
                style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}
              >
                Ritual <span style={{ color: COLORS.primary }}>Task</span>
              </h3>
              <p className="text-[9px] uppercase tracking-widest text-white/20 font-black">
                {initialData ? "Edit this ritual" : "Create a new ritual"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/[0.03] border border-white/5 text-white/20 hover:text-white hover:border-white/20 transition-all duration-300 active:scale-90"
            >
              <Icon icon="solar:close-square-bold-duotone" className="text-2xl" />
            </button>
          </div>

          {/* Body */}
          <div className="px-12 pb-6 space-y-8">
            {/* Title + icon + reward */}
            <div className="grid grid-cols-[1fr_100px_120px] gap-6">
              <div className="flex flex-col gap-3">
                <label className={labelCls}>Title</label>
                <PrimaryInput
                  fullWidth
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Share today's card to your story"
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className={labelCls}>Icon</label>
                <PrimaryInput
                  fullWidth
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  placeholder="✨"
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className={labelCls}>Reward ⭐</label>
                <PrimaryInput
                  fullWidth
                  type="number"
                  min={0}
                  value={form.reward}
                  onChange={(e) =>
                    setForm({ ...form, reward: Number(e.target.value) })
                  }
                  placeholder="5"
                />
              </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-3">
              <label className={labelCls}>Description (shown to the client)</label>
              <textarea
                className="w-full h-24 px-6 py-4 rounded-2xl border text-sm resize-none"
                style={{
                  backgroundColor: "rgba(255,255,255,0.02)",
                  borderColor: "rgba(255,255,255,0.05)",
                  color: COLORS.neutralWhite,
                  fontFamily: TYPOGRAPHY.fontFamily.body,
                }}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Tag @askvalentina in your story to earn Stardust."
              />
            </div>

            {/* Verification + trigger (trigger only when automatic) */}
            <div className="grid grid-cols-2 gap-8">
              <div className="flex flex-col gap-3">
                <label className={labelCls}>How is it verified?</label>
                <PrimarySelect
                  fullWidth
                  value={form.verification_type}
                  options={VERIFICATION_OPTIONS}
                  onChange={(val) =>
                    setForm({ ...form, verification_type: val as TaskFormData["verification_type"] })
                  }
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className={labelCls}>
                  {isAuto ? "Which event completes it?" : "Event (automatic only)"}
                </label>
                <PrimarySelect
                  fullWidth
                  disabled={!isAuto}
                  value={form.trigger_event ?? ""}
                  placeholder={isAuto ? "Choose an event" : "Not needed for manual tasks"}
                  options={TRIGGER_OPTIONS}
                  onChange={(val) =>
                    setForm({ ...form, trigger_event: val as TaskFormData["trigger_event"] })
                  }
                />
              </div>
            </div>

            {/* Frequency + status + weight */}
            <div className="grid grid-cols-[1fr_1fr_140px] gap-6">
              <div className="flex flex-col gap-3">
                <label className={labelCls}>How often can they earn it?</label>
                <PrimarySelect
                  fullWidth
                  value={form.frequency}
                  options={FREQUENCY_OPTIONS}
                  onChange={(val) =>
                    setForm({ ...form, frequency: val as TaskFormData["frequency"] })
                  }
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className={labelCls}>Status</label>
                <PrimarySelect
                  fullWidth
                  value={form.status}
                  options={STATUS_OPTIONS}
                  onChange={(val) =>
                    setForm({ ...form, status: val as TaskFormData["status"] })
                  }
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className={labelCls}>Show weight</label>
                <PrimaryInput
                  fullWidth
                  type="number"
                  min={0}
                  value={form.rotation_weight}
                  onChange={(e) =>
                    setForm({ ...form, rotation_weight: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            {/* Optional schedule */}
            <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 grid grid-cols-2 gap-8">
              <div className="flex flex-col gap-3">
                <label className={labelCls}>Starts (optional)</label>
                <PrimaryInput
                  fullWidth
                  type="datetime-local"
                  value={toInput(form.starts_at)}
                  onChange={(e) =>
                    setForm({ ...form, starts_at: fromInput(e.target.value) })
                  }
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className={labelCls}>Ends (optional)</label>
                <PrimaryInput
                  fullWidth
                  type="datetime-local"
                  value={toInput(form.ends_at)}
                  onChange={(e) =>
                    setForm({ ...form, ends_at: fromInput(e.target.value) })
                  }
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-12 pt-6 pb-12 sticky bottom-0 bg-[rgba(13,13,13,0.95)] backdrop-blur-xl">
            <button
              onClick={handleSave}
              disabled={!isValid || saving}
              className="relative w-full h-[64px] flex items-center justify-center gap-3 overflow-hidden rounded-[24px] transition-all duration-500 hover:scale-[1.01] active:scale-[0.98] group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ backgroundColor: COLORS.primary, boxShadow: `0 20px 40px ${COLORS.primary}20` }}
            >
              <span className="relative text-dark font-black uppercase text-[11px] tracking-[0.4em] flex items-center gap-2">
                {saving ? "Saving…" : initialData ? "Save Changes" : "Create Ritual"}
                <Icon icon="solar:double-alt-arrow-right-bold" className="text-lg" />
              </span>
            </button>
            {isAuto && !form.trigger_event && (
              <p className="text-center text-[10px] font-bold uppercase tracking-widest text-starGold/80 mt-4">
                Automatic tasks need an event to detect
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default TaskModal;

import { useState, useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import { PrimaryTable, type Column } from "../../../components/Table/PrimaryTable";
import DeleteModal from "../../../components/modals/DeleteModal";
import TaskModal from "../../../components/modals/TaskModal";
import PrimaryInput from "../../../components/CustomInputs/PrimaryInput";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { useToast } from "../../../components/Toast";
import { tasksApi } from "../api/tasksApi";
import {
  frequencyLabel,
  verificationLabel,
  type Task,
  type TaskFormData,
} from "../types/task.types";

const errMsg = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.response?.data?.detail || err?.message || fallback;

const TaskManager = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const toast = useToast();

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      setTasks(await tasksApi.listTasks());
    } catch (err: any) {
      const m = errMsg(err, "Failed to load tasks.");
      setError(m);
      toast.error(m);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(
    () =>
      tasks.filter((t) =>
        `${t.title} ${t.description ?? ""}`.toLowerCase().includes(search.toLowerCase())
      ),
    [tasks, search]
  );

  const handleSave = async (data: TaskFormData) => {
    try {
      setSaving(true);
      if (selected) {
        const updated = await tasksApi.updateTask(selected.id, data);
        setTasks((prev) => prev.map((t) => (t.id === selected.id ? updated : t)));
        toast.success("Ritual updated.");
      } else {
        const created = await tasksApi.createTask(data);
        setTasks((prev) => [created, ...prev]);
        toast.success("Ritual created.");
      }
      setIsModalOpen(false);
      setSelected(null);
    } catch (err: any) {
      toast.error(errMsg(err, "Could not save the ritual."));
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (task: Task) => {
    try {
      const copy = await tasksApi.duplicateTask(task.id);
      setTasks((prev) => [copy, ...prev]);
      toast.success("Copied — the copy is inactive so you can edit it first.");
    } catch (err: any) {
      toast.error(errMsg(err, "Could not duplicate."));
    }
  };

  const handleConfirmDelete = async () => {
    if (!toDelete) return;
    try {
      await tasksApi.deleteTask(toDelete.id);
      setTasks((prev) => prev.filter((t) => t.id !== toDelete.id));
      toast.success("Ritual deleted.");
      setIsDeleteOpen(false);
      setToDelete(null);
    } catch (err: any) {
      toast.error(errMsg(err, "Could not delete."));
    }
  };

  const columns: Column<Task>[] = [
    {
      key: "title",
      label: "Ritual",
      render: (t) => (
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl border-2"
            style={{
              backgroundColor: `${COLORS.primary}15`,
              borderColor: `${COLORS.primary}30`,
            }}
          >
            {t.icon || "✨"}
          </div>
          <div className="flex flex-col max-w-[280px]">
            <span className="text-white font-bold leading-tight text-sm">{t.title}</span>
            <span className="text-[10px] text-white/30 truncate">
              {t.description || "—"}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "reward",
      label: "Reward",
      render: (t) => (
        <span className="text-sm font-black" style={{ color: COLORS.starGold }}>
          ⭐ {t.reward}
        </span>
      ),
    },
    {
      key: "verification_type",
      label: "Verified by",
      render: (t) => (
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">
          {verificationLabel(t.verification_type)}
        </span>
      ),
    },
    {
      key: "frequency",
      label: "Frequency",
      render: (t) => (
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
          {frequencyLabel(t.frequency)}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (t) => {
        const active = t.status === "ACTIVE";
        return (
          <span
            className="text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-lg"
            style={{
              backgroundColor: active ? `${COLORS.success}20` : `${COLORS.neutralGray}20`,
              color: active ? COLORS.success : COLORS.neutralGray,
            }}
          >
            {active ? "Active" : "Inactive"}
          </span>
        );
      },
    },
  ];

  if (loading && tasks.length === 0) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4">
          <Icon icon="solar:magic-stick-3-bold-duotone" className="text-5xl text-primary animate-spin" />
          <span className="text-white/60 font-bold uppercase tracking-widest text-sm">Loading Rituals…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-12 min-h-screen" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      {/* Header */}
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h1 style={TYPOGRAPHY.headings.h2} className="uppercase italic tracking-tighter">
            Ritual <span style={{ color: COLORS.primary }}>Tasks</span>
          </h1>
          <p style={{ color: COLORS.neutralGray }} className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-50">
            Create and manage the tasks clients earn Stardust for
          </p>
        </div>
        <div className="text-white/10 font-black text-[9px] uppercase tracking-widest">
          Total Rituals: {tasks.length}
        </div>
      </div>

      {/* Controls */}
      <div
        className="p-6 rounded-[32px] border border-white/5 mb-10 flex flex-wrap items-end gap-10 shadow-2xl backdrop-blur-sm"
        style={{ backgroundColor: `${COLORS.surface}80` }}
      >
        <div className="flex-1 min-w-[300px]">
          <label className="block text-[9px] font-black uppercase text-white/20 mb-3 ml-1 tracking-widest">
            Search Rituals
          </label>
          <PrimaryInput
            fullWidth
            placeholder="Search by title or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Icon icon="solar:magnifer-linear" className="text-xl opacity-20" />}
          />
        </div>
        <button
          onClick={() => {
            setSelected(null);
            setIsModalOpen(true);
          }}
          className="h-[52px] px-12 rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] transition-all hover:scale-[1.02] active:scale-95 shadow-xl group"
          style={{ backgroundColor: COLORS.primary, color: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.heading }}
        >
          <span className="flex items-center gap-2">
            New Ritual
            <Icon icon="solar:add-circle-bold" className="text-lg group-hover:rotate-90 transition-transform" />
          </span>
        </button>
      </div>

      {/* Table */}
      <div className="rounded-[32px] overflow-hidden border border-white/5 bg-transparent shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
        <PrimaryTable
          title="RITUALS"
          data={filtered}
          columns={columns}
          searchEnabled={false}
          emptyText="No rituals yet — create your first one."
          emptyIcon="solar:magic-stick-3-bold-duotone"
          actionsColumn={(t) => (
            <div className="flex items-center justify-end gap-1 pr-4">
              <button
                className="p-3 rounded-xl text-white/20 hover:text-primary hover:bg-primary/5 transition-all"
                onClick={() => {
                  setSelected(t);
                  setIsModalOpen(true);
                }}
                title="Edit"
              >
                <Icon icon="solar:pen-new-round-bold-duotone" className="text-lg" />
              </button>
              <button
                className="p-3 rounded-xl text-white/20 hover:text-secondary hover:bg-secondary/5 transition-all"
                onClick={() => handleDuplicate(t)}
                title="Duplicate"
              >
                <Icon icon="solar:copy-bold-duotone" className="text-lg" />
              </button>
              <button
                className="p-3 rounded-xl text-white/20 hover:text-starGold hover:bg-starGold/5 transition-all"
                onClick={() => {
                  setToDelete(t);
                  setIsDeleteOpen(true);
                }}
                title="Delete"
              >
                <Icon icon="solar:trash-bin-trash-bold-duotone" className="text-lg" />
              </button>
            </div>
          )}
        />
      </div>

      {error && tasks.length === 0 && (
        <div className="mt-6 text-center text-white/50 text-sm">{error}</div>
      )}

      <TaskModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelected(null);
        }}
        onSave={handleSave}
        initialData={selected}
        saving={saving}
      />

      <DeleteModal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Ritual"
        itemName={toDelete?.title}
        description="Are you sure you want to delete this ritual? This cannot be undone."
      />
    </div>
  );
};

export default TaskManager;

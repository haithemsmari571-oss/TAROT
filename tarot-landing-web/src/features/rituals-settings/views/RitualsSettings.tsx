import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { useToast } from "../../../components/Toast";
import {
  ritualsSettingsApi,
  type ContentStatus,
  type GamificationSettings,
} from "../api/ritualsSettingsApi";

const err = (e: any, f: string) =>
  e?.response?.data?.detail || e?.response?.data?.message || e?.message || f;

const Field = ({
  label,
  hint,
  value,
  onChange,
  suffix,
  step = "1",
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: string;
}) => (
  <div>
    <label className="block text-sm font-semibold mb-1" style={{ color: COLORS.neutralWhite }}>{label}</label>
    <p className="text-xs mb-2" style={{ color: `${COLORS.neutralWhite}66` }}>{hint}</p>
    <div className="flex items-center gap-2">
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40 rounded-xl px-4 text-base"
        style={{ height: 48, backgroundColor: COLORS.dark, color: COLORS.neutralWhite, border: `1px solid ${COLORS.neutralWhite}22` }}
      />
      {suffix && <span className="text-sm" style={{ color: `${COLORS.neutralWhite}88` }}>{suffix}</span>}
    </div>
  </div>
);

const RitualsSettings = () => {
  const [s, setS] = useState<GamificationSettings | null>(null);
  const [status, setStatus] = useState<ContentStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const toast = useToast();
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setS(await ritualsSettingsApi.getSettings());
        setStatus(await ritualsSettingsApi.contentStatus());
      } catch (e: any) {
        toast.error(err(e, "Failed to load settings."));
      }
    })();
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, []);

  const refreshStatus = async () => {
    try { setStatus(await ritualsSettingsApi.contentStatus()); } catch { /* ignore */ }
  };

  const save = async () => {
    if (!s) return;
    try {
      setSaving(true);
      const updated = await ritualsSettingsApi.updateSettings(s);
      setS(updated);
      toast.success("Settings saved — live immediately, no redeploy.");
    } catch (e: any) {
      toast.error(err(e, "Save failed (values must be within range)."));
    } finally {
      setSaving(false);
    }
  };

  const generateNow = async () => {
    try {
      setGenerating(true);
      await ritualsSettingsApi.generateNow();
      toast.success("Generating tomorrow's content… watch the panel below.");
      // poll status until the run finishes
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        await refreshStatus();
      }, 4000);
      setTimeout(() => { if (pollRef.current) window.clearInterval(pollRef.current); setGenerating(false); }, 90000);
    } catch (e: any) {
      toast.error(err(e, "Couldn't start generation."));
      setGenerating(false);
    }
  };

  if (!s) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <Icon icon="solar:settings-bold-duotone" className="text-5xl text-primary animate-pulse" />
      </div>
    );
  }

  const run = status?.latest_run;

  return (
    <div className="p-12 min-h-screen" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      <div className="mb-8">
        <h1 style={TYPOGRAPHY.headings.h2} className="uppercase italic tracking-tighter">
          Rituals <span style={{ color: COLORS.primary }}>Settings</span>
        </h1>
        <p className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-50" style={{ color: COLORS.neutralGray }}>
          Economy controls + the nightly content engine
        </p>
      </div>

      {/* Settings */}
      <div className="rounded-2xl p-6 mb-8 max-w-2xl" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.neutralWhite}12` }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Field label="Rotation interval" hint="How often the 4-task strip refreshes." value={s.rotation_window_hours} onChange={(v) => setS({ ...s, rotation_window_hours: v })} suffix="hours" step="0.5" />
          <Field label="Tasks per rotation" hint="How many rituals show at once." value={s.tasks_per_window} onChange={(v) => setS({ ...s, tasks_per_window: v })} />
          <Field label="Earned redemption cap" hint="Max share of an order earned Stardust can cover." value={Math.round(s.earned_redemption_cap_pct * 100)} onChange={(v) => setS({ ...s, earned_redemption_cap_pct: v / 100 })} suffix="%" />
          <Field label="Earned Stardust expiry" hint="Days until earned Stardust fades." value={s.earned_expiry_days} onChange={(v) => setS({ ...s, earned_expiry_days: v })} suffix="days" />
        </div>
        <button onClick={save} disabled={saving} className="mt-6 h-12 px-8 rounded-xl font-bold text-sm disabled:opacity-50" style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>

      {/* Nightly content engine */}
      <div className="rounded-2xl p-6 max-w-2xl" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.primary}22` }}>
        <h3 className="text-lg font-bold mb-1" style={{ color: COLORS.neutralWhite }}>Nightly content engine</h3>
        <p className="text-sm mb-4" style={{ color: `${COLORS.neutralWhite}88` }}>
          Generates tomorrow's card, interpretation, manifestation, ritual and quote for all 12 signs.
        </p>

        {!status?.configured && (
          <div className="mb-4 rounded-xl p-3 text-sm" style={{ backgroundColor: `${COLORS.starGold}18`, color: COLORS.starGold }}>
            No Claude API key yet — add ANTHROPIC_API_KEY to TAROT-BACKEND/.env, then "Generate now".
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>Next scheduled run</p>
            <p className="text-sm" style={{ color: COLORS.neutralWhite }}>
              {status ? new Date(status.next_scheduled_run).toLocaleString() : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>Last run</p>
            <p className="text-sm" style={{ color: COLORS.neutralWhite }}>
              {run ? `${run.status} · ${run.signs_ok.length}/12 signs` : "never run"}
            </p>
          </div>
        </div>

        {run && (
          <div className="mb-4 rounded-xl p-3 text-sm" style={{ backgroundColor: COLORS.dark, color: `${COLORS.neutralWhite}cc` }}>
            <p>For <b>{run.content_date}</b> · {run.trigger} · {run.finished_at ? new Date(run.finished_at).toLocaleString() : "running…"}</p>
            <p className="mt-1">Tokens: {run.output_tokens} · Est. cost: ${run.cost_usd}</p>
            {run.signs_failed.length > 0 && (
              <p className="mt-1" style={{ color: COLORS.starGold }}>
                Kept yesterday's content for: {run.signs_failed.map((f) => f.sign).join(", ")}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={generateNow} disabled={generating || !status?.configured} className="h-12 px-8 rounded-xl font-bold text-sm disabled:opacity-50" style={{ backgroundColor: COLORS.starGold, color: COLORS.dark }}>
            {generating ? "Generating…" : "Generate now"}
          </button>
          <button onClick={refreshStatus} className="h-12 px-5 rounded-xl font-semibold text-sm border" style={{ color: COLORS.neutralWhite, borderColor: `${COLORS.neutralWhite}22` }}>
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
};

export default RitualsSettings;

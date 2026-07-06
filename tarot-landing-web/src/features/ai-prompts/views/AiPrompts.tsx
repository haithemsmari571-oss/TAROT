import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { useToast } from "../../../components/Toast";
import {
  aiPromptsApi,
  type AiPromptDetail,
  type AiPromptListItem,
  type AiPromptTestResult,
  type AiPromptVersion,
} from "../api/aiPromptsApi";

const err = (e: any, f: string) =>
  e?.response?.data?.detail || e?.response?.data?.message || e?.message || f;

const AiPrompts = () => {
  const [items, setItems] = useState<AiPromptListItem[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AiPromptDetail | null>(null);
  const toast = useToast();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      const data = await aiPromptsApi.list();
      setItems(data.items);
      setConfigured(data.configured);
    } catch (e: any) {
      toast.error(err(e, "Failed to load prompts."));
    } finally {
      setLoading(false);
    }
  };

  const open = async (key: string) => {
    try {
      setSelected(await aiPromptsApi.get(key));
    } catch (e: any) {
      toast.error(err(e, "Failed to open prompt."));
    }
  };

  if (loading) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <Icon icon="solar:magic-stick-3-bold-duotone" className="text-5xl text-primary animate-pulse" />
      </div>
    );
  }

  if (selected) {
    return (
      <PromptEditor
        prompt={selected}
        configured={configured}
        onBack={() => { setSelected(null); load(); }}
        onChanged={(p) => setSelected(p)}
      />
    );
  }

  return (
    <div className="p-12 min-h-screen" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      <div className="mb-8">
        <h1 style={TYPOGRAPHY.headings.h2} className="uppercase italic tracking-tighter">
          AI <span style={{ color: COLORS.primary }}>Prompts</span>
        </h1>
        <p className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-50" style={{ color: COLORS.neutralGray }}>
          Every AI prompt on the platform — edit the words, never the code
        </p>
      </div>

      {!configured && (
        <div className="mb-6 rounded-2xl p-4 text-sm" style={{ backgroundColor: `${COLORS.starGold}18`, color: COLORS.starGold, border: `1px solid ${COLORS.starGold}44` }}>
          No Claude API key configured yet — editing works, but "Run test" and the nightly job need a key.
          Add <b>ANTHROPIC_API_KEY</b> to TAROT-BACKEND/.env (from console.anthropic.com).
        </div>
      )}

      <div className="space-y-4 max-w-3xl">
        {items.map((p) => (
          <button
            key={p.key}
            onClick={() => open(p.key)}
            className="w-full text-left rounded-2xl p-5 border transition-all hover:border-primary/40"
            style={{ backgroundColor: COLORS.surface, borderColor: `${COLORS.neutralWhite}12` }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-bold text-white">{p.name}</p>
                <p className="text-sm mt-1" style={{ color: `${COLORS.neutralWhite}88` }}>{p.description}</p>
                <p className="text-[11px] mt-2 font-mono" style={{ color: COLORS.primary }}>{p.model}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>Last run</p>
                <p className="text-xs" style={{ color: `${COLORS.neutralWhite}aa` }}>
                  {p.last_run_status || "never"}
                </p>
                <Icon icon="solar:pen-new-round-bold-duotone" className="text-xl mt-2" style={{ color: COLORS.primary }} />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

/* ── Editor ──────────────────────────────────────────────────────────────── */
const PromptEditor = ({
  prompt,
  configured,
  onBack,
  onChanged,
}: {
  prompt: AiPromptDetail;
  configured: boolean;
  onBack: () => void;
  onChanged: (p: AiPromptDetail) => void;
}) => {
  const [text, setText] = useState(prompt.prompt);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiPromptTestResult | null>(null);
  const [versions, setVersions] = useState<AiPromptVersion[] | null>(null);
  const toast = useToast();

  const dirty = text !== prompt.prompt;

  const save = async () => {
    try {
      setSaving(true);
      const p = await aiPromptsApi.save(prompt.key, text);
      onChanged(p);
      toast.success("Prompt saved. Previous version kept in history.");
    } catch (e: any) {
      toast.error(err(e, "Save failed."));
    } finally {
      setSaving(false);
    }
  };

  const restoreDefault = async () => {
    try {
      const p = await aiPromptsApi.restoreDefault(prompt.key);
      setText(p.prompt);
      onChanged(p);
      toast.success("Restored the shipped default.");
    } catch (e: any) {
      toast.error(err(e, "Restore failed."));
    }
  };

  const runTest = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      if (dirty) await save();
      const r = await aiPromptsApi.test(prompt.key);
      setTestResult(r);
    } catch (e: any) {
      toast.error(err(e, "Test failed."));
    } finally {
      setTesting(false);
    }
  };

  const loadVersions = async () => {
    try {
      const { items } = await aiPromptsApi.versions(prompt.key);
      setVersions(items);
    } catch (e: any) {
      toast.error(err(e, "Couldn't load versions."));
    }
  };

  const restoreVersion = async (id: number) => {
    try {
      const p = await aiPromptsApi.restoreVersion(prompt.key, id);
      setText(p.prompt);
      onChanged(p);
      setVersions(null);
      toast.success("Version restored.");
    } catch (e: any) {
      toast.error(err(e, "Restore failed."));
    }
  };

  return (
    <div className="p-12 min-h-screen" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      <button onClick={onBack} className="mb-6 flex items-center gap-2 text-sm font-bold uppercase tracking-widest" style={{ color: COLORS.primary }}>
        <Icon icon="solar:alt-arrow-left-bold" /> All prompts
      </button>

      <h1 style={TYPOGRAPHY.headings.h3} className="mb-1">{prompt.name}</h1>
      <p className="text-sm mb-1" style={{ color: `${COLORS.neutralWhite}88` }}>{prompt.description}</p>
      <p className="text-[11px] font-mono mb-6" style={{ color: COLORS.primary }}>{prompt.model}</p>

      {/* Variables documented */}
      {prompt.variables?.length > 0 && (
        <div className="mb-5 rounded-2xl p-4" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.neutralWhite}12` }}>
          <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: COLORS.neutralGray }}>
            Placeholders you can use
          </p>
          <div className="space-y-1">
            {prompt.variables.map((v) => (
              <p key={v.name} className="text-sm" style={{ color: `${COLORS.neutralWhite}cc` }}>
                <span className="font-mono" style={{ color: COLORS.starGold }}>{`{${v.name}}`}</span> — {v.description}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Editor */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={16}
        className="w-full rounded-2xl p-4 text-sm font-mono leading-relaxed"
        style={{ backgroundColor: COLORS.surface, color: COLORS.neutralWhite, border: `1px solid ${COLORS.neutralWhite}22` }}
      />
      <div className="flex items-center justify-between mt-2 mb-5">
        <span className="text-xs" style={{ color: `${COLORS.neutralWhite}55` }}>{text.length} characters</span>
        {dirty && <span className="text-xs" style={{ color: COLORS.starGold }}>Unsaved changes</span>}
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={save} disabled={!dirty || saving} className="h-12 px-8 rounded-xl font-bold text-sm disabled:opacity-50" style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={runTest} disabled={testing} className="h-12 px-8 rounded-xl font-bold text-sm disabled:opacity-50" style={{ backgroundColor: COLORS.starGold, color: COLORS.dark }}>
          {testing ? "Running…" : "Run test"}
        </button>
        <button onClick={restoreDefault} className="h-12 px-6 rounded-xl font-semibold text-sm border" style={{ color: COLORS.neutralWhite, borderColor: `${COLORS.neutralWhite}22` }}>
          Restore default
        </button>
        <button onClick={() => (versions ? setVersions(null) : loadVersions())} className="h-12 px-6 rounded-xl font-semibold text-sm border" style={{ color: COLORS.neutralWhite, borderColor: `${COLORS.neutralWhite}22` }}>
          {versions ? "Hide history" : "Version history"}
        </button>
      </div>

      {!configured && (
        <p className="text-sm mb-4" style={{ color: COLORS.starGold }}>
          Add ANTHROPIC_API_KEY to run a live test.
        </p>
      )}

      {/* Test output */}
      {testResult && (
        <div className="mb-6 rounded-2xl p-5" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.primary}30` }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold" style={{ color: COLORS.primary }}>Test output</p>
            <p className="text-xs" style={{ color: `${COLORS.neutralWhite}66` }}>
              {testResult.input_tokens + testResult.output_tokens} tokens · ~${testResult.cost_usd}
            </p>
          </div>
          <pre className="text-sm whitespace-pre-wrap font-mono" style={{ color: `${COLORS.neutralWhite}dd` }}>{testResult.text}</pre>
        </div>
      )}

      {/* Version history */}
      {versions && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.neutralWhite}12` }}>
          <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: COLORS.neutralGray }}>
            Last {versions.length} versions
          </p>
          <div className="space-y-2">
            {versions.map((v, i) => (
              <div key={v.id} className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm text-white">{i === 0 ? "Current" : `Version ${v.id}`} · {v.char_count} chars</p>
                  <p className="text-[11px]" style={{ color: `${COLORS.neutralWhite}55` }}>
                    {v.created_at ? new Date(v.created_at).toLocaleString() : ""}
                  </p>
                  <p className="text-[11px] mt-1 truncate max-w-md" style={{ color: `${COLORS.neutralWhite}77` }}>{v.text.slice(0, 90)}…</p>
                </div>
                <button onClick={() => restoreVersion(v.id)} className="text-sm font-semibold shrink-0" style={{ color: COLORS.primary }}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AiPrompts;

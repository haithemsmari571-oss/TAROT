import { useState, useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { landingEditorApi } from "../api/landingEditorApi";
import { useToast } from "../../../components/Toast";
import { HeroForm } from "../components/HeroForm";
import { ServicesForm } from "../components/ServicesForm";
import { PackagesForm } from "../components/PackagesForm";
import { TestimonialsForm } from "../components/TestimonialsForm";
import { FooterForm } from "../components/FooterForm";
import { AboutForm } from "../components/AboutForm";
import { PsychicsForm } from "../components/PsychicsForm";
import type {
  LandingContentSection,
  HeroContent,
  ServiceContent,
  PackageContent,
  TestimonialContent,
  FooterContent,
  AboutContent,
  PsychicsContent,
} from "../types/landingEditor.types";

interface Tab {
  key: string;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { key: "hero", label: "Hero", icon: "solar:gallery-wide-bold-duotone" },
  { key: "services", label: "Services", icon: "solar:widget-4-bold-duotone" },
  { key: "packages", label: "Packages", icon: "solar:box-minimalistic-bold-duotone" },
  { key: "testimonials", label: "Testimonials", icon: "solar:chat-square-like-bold-duotone" },
  { key: "psychics", label: "Psychics", icon: "solar:users-group-rounded-bold-duotone" },
  { key: "footer", label: "Footer", icon: "solar:text-cross-broken-bold-duotone" },
  { key: "about", label: "About", icon: "solar:info-circle-bold-duotone" },
];

const LandingEditor = () => {
  const [sections, setSections] = useState<LandingContentSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("hero");
  const [saving, setSaving] = useState(false);
  const [localContent, setLocalContent] = useState<Record<string, unknown>>({});

  const toast = useToast();

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await landingEditorApi.getAll();
      setSections(data);
      const contentMap: Record<string, unknown> = {};
      for (const s of data) {
        contentMap[s.section] = s.content;
      }
      setLocalContent(contentMap);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Failed to load landing content.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const currentContent = useMemo(() => localContent[activeTab], [localContent, activeTab]);

  const handleChange = (content: unknown) => {
    setLocalContent((prev) => ({ ...prev, [activeTab]: content }));
  };

  const handleSave = async () => {
    const content = localContent[activeTab];
    if (!content) return;
    try {
      setSaving(true);
      const updated = await landingEditorApi.update(activeTab, content);
      setSections((prev) =>
        prev.map((s) => (s.section === activeTab ? updated : s))
      );
      toast.success(`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} section saved!`);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Failed to save.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4">
          <Icon icon="svg-spinners:3-dots-fade" className="text-5xl" style={{ color: COLORS.primary }} />
          <span className="text-white/60 font-bold uppercase tracking-widest text-sm">Loading Landing Content...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4 max-w-md">
          <Icon icon="solar:danger-circle-bold-duotone" className="text-5xl" style={{ color: COLORS.starGold }} />
          <span className="text-white font-bold text-lg">{error}</span>
          <button
            onClick={fetchAll}
            className="px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:scale-105 transition-transform"
            style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-12 min-h-screen" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      <div className="mb-10">
        <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter" style={TYPOGRAPHY.headings.h2}>
          <span style={{ color: COLORS.primary }}>Landing</span> Editor
        </h1>
        <p className="text-[10px] font-bold uppercase tracking-widest mt-2" style={{ color: COLORS.neutralGray }}>
          Edit Home Page Content
        </p>
      </div>

      <div
        className="p-1.5 rounded-2xl border inline-flex gap-1 mb-8 flex-wrap"
        style={{ backgroundColor: COLORS.surfaceAccent, borderColor: COLORS.neutralDarkGray }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="relative flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              style={{
                backgroundColor: isActive ? COLORS.surface : "transparent",
                color: isActive ? COLORS.neutralWhite : COLORS.neutralGray,
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="landing-tab-bg"
                  className="absolute inset-0 rounded-xl border"
                  style={{ borderColor: COLORS.neutralDarkGray }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon icon={tab.icon} className="text-base relative z-10" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div
        className="p-8 rounded-[32px] border shadow-2xl"
        style={{ backgroundColor: `${COLORS.surface}CC`, borderColor: COLORS.neutralDarkGray }}
      >
        {activeTab === "hero" && (
          <HeroForm
            content={(currentContent as HeroContent) || ({} as HeroContent)}
            onChange={handleChange}
          />
        )}
        {activeTab === "services" && (
          <ServicesForm
            content={(currentContent as ServiceContent) || ({} as ServiceContent)}
            onChange={handleChange}
          />
        )}
        {activeTab === "packages" && (
          <PackagesForm
            content={(currentContent as PackageContent) || ({} as PackageContent)}
            onChange={handleChange}
          />
        )}
        {activeTab === "testimonials" && (
          <TestimonialsForm
            content={(currentContent as TestimonialContent) || ({} as TestimonialContent)}
            onChange={handleChange}
          />
        )}
        {activeTab === "psychics" && (
          <PsychicsForm
            content={(currentContent as PsychicsContent) || ({} as PsychicsContent)}
            onChange={handleChange}
          />
        )}
        {activeTab === "footer" && (
          <FooterForm
            content={(currentContent as FooterContent) || ({} as FooterContent)}
            onChange={handleChange}
          />
        )}
        {activeTab === "about" && (
          <AboutForm
            content={(currentContent as AboutContent) || ({} as AboutContent)}
            onChange={handleChange}
          />
        )}

        <div className="mt-10 pt-6 border-t flex justify-end" style={{ borderColor: COLORS.neutralDarkGray }}>
          <motion.button
            onClick={handleSave}
            disabled={saving}
            className="px-10 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-40"
            style={{
              backgroundColor: COLORS.primary,
              color: COLORS.dark,
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Icon icon="svg-spinners:3-dots-fade" className="text-lg" />
                Saving...
              </span>
            ) : (
              `Save ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default LandingEditor;

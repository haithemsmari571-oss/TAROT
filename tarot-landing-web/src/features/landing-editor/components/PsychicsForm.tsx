import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { COLORS } from "../../../theme";
import type { PsychicsContent } from "../types/landingEditor.types";
import { FieldSet } from "./FieldSet";
import axiosClient from "../../../lib/axiosClient";

interface PsychicsFormProps {
  content: PsychicsContent;
  onChange: (content: PsychicsContent) => void;
}

interface PsychicOption {
  id: number;
  username: string;
  email: string;
  profile_picture_url: string | null;
  bio: string | null;
}

export const PsychicsForm = ({ content, onChange }: PsychicsFormProps) => {
  const [psychics, setPsychics] = useState<PsychicOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axiosClient
      .get("/psychic", { params: { limit: 100 } })
      .then((res) => {
        setPsychics(res.data?.items || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const update = (field: keyof PsychicsContent, value: unknown) => {
    onChange({ ...content, [field]: value });
  };

  const togglePsychic = (id: number) => {
    const ids = content.featuredPsychicIds.includes(id)
      ? content.featuredPsychicIds.filter((i) => i !== id)
      : [...content.featuredPsychicIds, id];
    update("featuredPsychicIds", ids);
  };

  const selectAll = () => {
    update("featuredPsychicIds", psychics.map((p) => p.id));
  };

  const deselectAll = () => {
    update("featuredPsychicIds", []);
  };

  const inputStyle = {
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.neutralDarkGray}`,
    color: COLORS.neutralWhite,
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-6">
        <FieldSet label="Heading">
          <input
            value={content.heading}
            onChange={(e) => update("heading", e.target.value)}
            placeholder="Find the psychic reader who"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={inputStyle}
          />
        </FieldSet>

        <FieldSet label="Heading Highlighted">
          <input
            value={content.headingHighlighted}
            onChange={(e) => update("headingHighlighted", e.target.value)}
            placeholder="feels right"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={inputStyle}
          />
        </FieldSet>

        <FieldSet label="Subtitle">
          <input
            value={content.subtitle}
            onChange={(e) => update("subtitle", e.target.value)}
            placeholder="Ready to feel clearer?"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={inputStyle}
          />
        </FieldSet>
      </div>

      <FieldSet label="Subtitle Line 2">
        <input
          value={content.subtitleLine2}
          onChange={(e) => update("subtitleLine2", e.target.value)}
          placeholder="Find a spiritual advisor online for your needs"
          className="w-full px-4 py-3 rounded-xl outline-none transition-all max-w-xl"
          style={inputStyle}
        />
      </FieldSet>

      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>
            Featured Psychics ({content.featuredPsychicIds.length} selected)
          </span>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-[10px] px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider"
              style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="text-[10px] px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider"
              style={{ backgroundColor: COLORS.surfaceAccent, color: COLORS.neutralGray }}
            >
              Deselect All
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 py-8">
            <Icon icon="svg-spinners:3-dots-fade" className="text-xl" style={{ color: COLORS.primary }} />
            <span className="text-xs text-white/40 font-bold uppercase tracking-wider">Loading psychics...</span>
          </div>
        ) : psychics.length === 0 ? (
          <div
            className="p-8 rounded-2xl border text-center"
            style={{ backgroundColor: `${COLORS.surface}80`, borderColor: COLORS.neutralDarkGray }}
          >
            <p className="text-xs text-white/40 font-medium">No psychics found. Create psychics first in the Management section.</p>
          </div>
        ) : (
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ borderColor: COLORS.neutralDarkGray }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-0">
              {psychics.map((psychic) => {
                const selected = content.featuredPsychicIds.includes(psychic.id);
                return (
                  <button
                    key={psychic.id}
                    onClick={() => togglePsychic(psychic.id)}
                    className="flex items-center gap-3 p-4 transition-all text-left border-b border-r"
                    style={{
                      backgroundColor: selected ? `${COLORS.primary}10` : "transparent",
                      borderColor: COLORS.neutralDarkGray,
                    }}
                  >
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center transition-all"
                      style={{
                        backgroundColor: selected ? COLORS.primary : "transparent",
                        border: `2px solid ${selected ? COLORS.primary : COLORS.neutralGray}`,
                      }}
                    >
                      {selected && <Icon icon="ph:check-bold" className="text-xs" style={{ color: COLORS.dark }} />}
                    </div>
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black uppercase shrink-0"
                        style={{
                          backgroundColor: `${COLORS.primary}20`,
                          color: COLORS.primary,
                        }}
                      >
                        {psychic.username.substring(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p
                          className="text-sm font-bold truncate"
                          style={{ color: selected ? COLORS.neutralWhite : COLORS.neutralGray }}
                        >
                          {psychic.username}
                        </p>
                        <p className="text-[9px] uppercase tracking-wider truncate" style={{ color: COLORS.neutralGray }}>
                          ID: {psychic.id}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!loading && psychics.length > 0 && content.featuredPsychicIds.length === 0 && (
          <p className="text-[10px] mt-3 font-medium" style={{ color: COLORS.starGold }}>
            No psychics selected — all psychics will be shown on the home page.
          </p>
        )}
      </div>
    </div>
  );
};

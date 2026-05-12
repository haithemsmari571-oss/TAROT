import { COLORS } from "../../../theme";
import type { HeroContent } from "../types/landingEditor.types";
import { FieldSet } from "./FieldSet";

interface HeroFormProps {
  content: HeroContent;
  onChange: (content: HeroContent) => void;
}

export const HeroForm = ({ content, onChange }: HeroFormProps) => {
  const update = (field: keyof HeroContent, value: string) => {
    onChange({ ...content, [field]: value });
  };

  return (
    <div className="space-y-6">
      <FieldSet label="Badge (pill text)">
        <input
          value={content.badge}
          onChange={(e) => update("badge", e.target.value)}
          placeholder="Psychic & Intuitive Readings"
          className="w-full px-4 py-3 rounded-xl outline-none transition-all"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.neutralDarkGray}`,
            color: COLORS.neutralWhite,
          }}
        />
      </FieldSet>

      <FieldSet label="Name">
        <input
          value={content.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Haithem Smari"
          className="w-full px-4 py-3 rounded-xl outline-none transition-all"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.neutralDarkGray}`,
            color: COLORS.neutralWhite,
          }}
        />
      </FieldSet>

      <div className="grid grid-cols-2 gap-6">
        <FieldSet label="Headline (before gradient)">
          <input
            value={content.headline}
            onChange={(e) => update("headline", e.target.value)}
            placeholder="Clarity, Guidance"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.neutralDarkGray}`,
              color: COLORS.neutralWhite,
            }}
          />
        </FieldSet>

        <FieldSet label="Headline Highlighted (gradient)">
          <input
            value={content.headlineHighlighted}
            onChange={(e) => update("headlineHighlighted", e.target.value)}
            placeholder="& Divine Truth"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.neutralDarkGray}`,
              color: COLORS.neutralWhite,
            }}
          />
        </FieldSet>
      </div>

      <FieldSet label="Subtitle">
        <textarea
          value={content.subtitle}
          onChange={(e) => update("subtitle", e.target.value)}
          placeholder="Navigate life's complexity with insights you can trust..."
          rows={3}
          className="w-full px-4 py-3 rounded-xl outline-none transition-all resize-none"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.neutralDarkGray}`,
            color: COLORS.neutralWhite,
          }}
        />
      </FieldSet>

      <div className="grid grid-cols-2 gap-6">
        <FieldSet label="Primary CTA">
          <input
            value={content.primaryCta}
            onChange={(e) => update("primaryCta", e.target.value)}
            placeholder="HIRE ME"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.neutralDarkGray}`,
              color: COLORS.neutralWhite,
            }}
          />
        </FieldSet>

        <FieldSet label="Secondary CTA">
          <input
            value={content.secondaryCta}
            onChange={(e) => update("secondaryCta", e.target.value)}
            placeholder="THE ARCHIVE"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.neutralDarkGray}`,
              color: COLORS.neutralWhite,
            }}
          />
        </FieldSet>
      </div>
    </div>
  );
};

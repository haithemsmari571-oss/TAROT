import { COLORS } from "../../../theme";
import type { AboutContent } from "../types/landingEditor.types";
import { FieldSet } from "./FieldSet";

interface AboutFormProps {
  content: AboutContent;
  onChange: (content: AboutContent) => void;
}

export const AboutForm = ({ content, onChange }: AboutFormProps) => {
  const update = (field: keyof AboutContent, value: string) => {
    onChange({ ...content, [field]: value });
  };

  const inputStyle = {
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.neutralDarkGray}`,
    color: COLORS.neutralWhite,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6">
        <FieldSet label="Badge">
          <input
            value={content.badge}
            onChange={(e) => update("badge", e.target.value)}
            placeholder="The Foundation"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={inputStyle}
          />
        </FieldSet>

        <FieldSet label="Title">
          <input
            value={content.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="OUR"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={inputStyle}
          />
        </FieldSet>

        <FieldSet label="Title Highlighted">
          <input
            value={content.titleHighlighted}
            onChange={(e) => update("titleHighlighted", e.target.value)}
            placeholder="ETHOS"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={inputStyle}
          />
        </FieldSet>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <FieldSet label="Established text">
          <input
            value={content.established}
            onChange={(e) => update("established", e.target.value)}
            placeholder="Established 2026"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={inputStyle}
          />
        </FieldSet>

        <FieldSet label="Tagline">
          <input
            value={content.tagline}
            onChange={(e) => update("tagline", e.target.value)}
            placeholder="Guided by the absolute resonance of the stars"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={inputStyle}
          />
        </FieldSet>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <FieldSet label="Left Tag (side decorative)">
          <input
            value={content.leftTag}
            onChange={(e) => update("leftTag", e.target.value)}
            placeholder="Celestial Navigation System v1.0"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={inputStyle}
          />
        </FieldSet>

        <FieldSet label="Right Tag (side decorative)">
          <input
            value={content.rightTag}
            onChange={(e) => update("rightTag", e.target.value)}
            placeholder="Deciphering the Void"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={inputStyle}
          />
        </FieldSet>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <FieldSet label="Body Title">
            <input
              value={content.bodyTitle}
              onChange={(e) => update("bodyTitle", e.target.value)}
              placeholder="Our Mission"
              className="w-full px-4 py-3 rounded-xl outline-none transition-all"
              style={inputStyle}
            />
          </FieldSet>
          <div className="mt-4">
            <FieldSet label="Body Content">
              <textarea
                value={content.bodyContent}
                onChange={(e) => update("bodyContent", e.target.value)}
                placeholder="We are dedicated to bridging the gap..."
                rows={5}
                className="w-full px-4 py-3 rounded-xl outline-none transition-all resize-none"
                style={inputStyle}
              />
            </FieldSet>
          </div>
        </div>

        <div>
          <FieldSet label="Mission Title">
            <input
              value={content.missionTitle}
              onChange={(e) => update("missionTitle", e.target.value)}
              placeholder="The Vision"
              className="w-full px-4 py-3 rounded-xl outline-none transition-all"
              style={inputStyle}
            />
          </FieldSet>
          <div className="mt-4">
            <FieldSet label="Mission Content">
              <textarea
                value={content.missionContent}
                onChange={(e) => update("missionContent", e.target.value)}
                placeholder="To create a sanctuary where seekers find clarity..."
                rows={5}
                className="w-full px-4 py-3 rounded-xl outline-none transition-all resize-none"
                style={inputStyle}
              />
            </FieldSet>
          </div>
        </div>
      </div>
    </div>
  );
};

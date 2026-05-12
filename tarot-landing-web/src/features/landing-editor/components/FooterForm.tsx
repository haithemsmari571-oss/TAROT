import { Icon } from "@iconify/react";
import { COLORS } from "../../../theme";
import type { FooterContent, SocialLink, NavLink } from "../types/landingEditor.types";
import { FieldSet } from "./FieldSet";

interface FooterFormProps {
  content: FooterContent;
  onChange: (content: FooterContent) => void;
}

export const FooterForm = ({ content, onChange }: FooterFormProps) => {
  const update = (field: keyof FooterContent, value: unknown) => {
    onChange({ ...content, [field]: value });
  };

  const updateSocialLink = (index: number, link: SocialLink) => {
    const links = [...content.socialLinks];
    links[index] = link;
    update("socialLinks", links);
  };

  const addSocialLink = () => {
    update("socialLinks", [...content.socialLinks, { platform: "", url: "#", icon: "" }]);
  };

  const removeSocialLink = (index: number) => {
    update("socialLinks", content.socialLinks.filter((_, i) => i !== index));
  };

  const updateNavLink = (index: number, link: NavLink) => {
    const links = [...content.navLinks];
    links[index] = link;
    update("navLinks", links);
  };

  const addNavLink = () => {
    update("navLinks", [...content.navLinks, { name: "", path: "/" }]);
  };

  const removeNavLink = (index: number) => {
    update("navLinks", content.navLinks.filter((_, i) => i !== index));
  };

  const inputStyle = {
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.neutralDarkGray}`,
    color: COLORS.neutralWhite,
  };

  return (
    <div className="space-y-8">
      <FieldSet label="Brand Name">
        <input
          value={content.brandName}
          onChange={(e) => update("brandName", e.target.value)}
          placeholder="The Alchemical Exchange"
          className="w-full px-4 py-3 rounded-xl outline-none transition-all"
          style={inputStyle}
        />
      </FieldSet>

      <FieldSet label="Description">
        <textarea
          value={content.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="A sanctuary for those ready to transcend..."
          rows={3}
          className="w-full px-4 py-3 rounded-xl outline-none transition-all resize-none"
          style={inputStyle}
        />
      </FieldSet>

      <FieldSet label="Copyright">
        <input
          value={content.copyright}
          onChange={(e) => update("copyright", e.target.value)}
          placeholder="\u00a9 2026 The Alchemical Exchange"
          className="w-full px-4 py-3 rounded-xl outline-none transition-all max-w-md"
          style={inputStyle}
        />
      </FieldSet>

      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>
            Navigation Links
          </span>
          <button
            onClick={addNavLink}
            className="text-[10px] px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider"
            style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
          >
            + Add
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {content.navLinks.map((link, i) => (
            <div
              key={i}
              className="p-4 rounded-2xl border flex items-center gap-3"
              style={{ backgroundColor: `${COLORS.surface}80`, borderColor: COLORS.neutralDarkGray }}
            >
              <div className="flex-1 grid grid-cols-2 gap-3">
                <input
                  value={link.name}
                  onChange={(e) => updateNavLink(i, { ...link, name: e.target.value })}
                  placeholder="Link name"
                  className="w-full px-3 py-2 rounded-xl outline-none transition-all text-sm"
                  style={inputStyle}
                />
                <input
                  value={link.path}
                  onChange={(e) => updateNavLink(i, { ...link, path: e.target.value })}
                  placeholder="/path"
                  className="w-full px-3 py-2 rounded-xl outline-none transition-all text-sm"
                  style={inputStyle}
                />
              </div>
              <button
                onClick={() => removeNavLink(i)}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-all shrink-0"
                style={{ color: COLORS.error }}
              >
                <Icon icon="ph:x-bold" className="text-sm" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>
            Social Links
          </span>
          <button
            onClick={addSocialLink}
            className="text-[10px] px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider"
            style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
          >
            + Add
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {content.socialLinks.map((link, i) => (
            <div
              key={i}
              className="p-4 rounded-2xl border space-y-3"
              style={{ backgroundColor: `${COLORS.surface}80`, borderColor: COLORS.neutralDarkGray }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: COLORS.secondary }}>
                  #{i + 1}
                </span>
                <button
                  onClick={() => removeSocialLink(i)}
                  className="p-1.5 rounded-lg hover:bg-white/5 transition-all"
                  style={{ color: COLORS.error }}
                >
                  <Icon icon="ph:x-bold" className="text-sm" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <FieldSet label="Platform">
                    <input
                      value={link.platform}
                      onChange={(e) => updateSocialLink(i, { ...link, platform: e.target.value })}
                      placeholder="instagram"
                      className="w-full px-3 py-2 rounded-xl outline-none transition-all text-sm"
                      style={inputStyle}
                    />
                  </FieldSet>
                </div>
                <div className="col-span-2">
                  <FieldSet label="URL">
                    <input
                      value={link.url}
                      onChange={(e) => updateSocialLink(i, { ...link, url: e.target.value })}
                      placeholder="https://instagram.com/..."
                      className="w-full px-3 py-2 rounded-xl outline-none transition-all text-sm"
                      style={inputStyle}
                    />
                  </FieldSet>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

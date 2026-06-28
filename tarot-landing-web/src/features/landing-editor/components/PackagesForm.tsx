import { COLORS } from "../../../theme";
import type { PackageContent, PackageItem } from "../types/landingEditor.types";
import { FieldSet } from "./FieldSet";

interface PackagesFormProps {
  content: PackageContent;
  onChange: (content: PackageContent) => void;
}

export const PackagesForm = ({ content, onChange }: PackagesFormProps) => {
  const updateField = (field: keyof PackageContent, value: unknown) => {
    onChange({ ...content, [field]: value });
  };

  const updatePackage = (index: number, pkg: PackageItem) => {
    const packages = [...content.packages];
    packages[index] = pkg;
    updateField("packages", packages);
  };

  const updateFeature = (pkgIndex: number, featIndex: number, value: string) => {
    const pkg = { ...content.packages[pkgIndex] };
    const features = [...pkg.features];
    features[featIndex] = value;
    updatePackage(pkgIndex, { ...pkg, features });
  };

  const addFeature = (pkgIndex: number) => {
    const pkg = { ...content.packages[pkgIndex] };
    updatePackage(pkgIndex, { ...pkg, features: [...pkg.features, ""] });
  };

  const removeFeature = (pkgIndex: number, featIndex: number) => {
    const pkg = { ...content.packages[pkgIndex] };
    updatePackage(pkgIndex, { ...pkg, features: pkg.features.filter((_, i) => i !== featIndex) });
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-6">
        <FieldSet label="Badge">
          <input
            value={content.badge}
            onChange={(e) => updateField("badge", e.target.value)}
            placeholder="The Sacred Offerings"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.neutralDarkGray}`,
              color: COLORS.neutralWhite,
            }}
          />
        </FieldSet>

        <FieldSet label="Heading">
          <input
            value={content.heading}
            onChange={(e) => updateField("heading", e.target.value)}
            placeholder="Choose the"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.neutralDarkGray}`,
              color: COLORS.neutralWhite,
            }}
          />
        </FieldSet>

        <FieldSet label="Heading Highlighted">
          <input
            value={content.headingHighlighted}
            onChange={(e) => updateField("headingHighlighted", e.target.value)}
            placeholder="Depth"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.neutralDarkGray}`,
              color: COLORS.neutralWhite,
            }}
          />
        </FieldSet>
      </div>

      <FieldSet label="Subheading">
        <input
          value={content.subheading}
          onChange={(e) => updateField("subheading", e.target.value)}
          placeholder="of Your Insight"
          className="w-full px-4 py-3 rounded-xl outline-none transition-all max-w-md"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.neutralDarkGray}`,
            color: COLORS.neutralWhite,
          }}
        />
      </FieldSet>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: COLORS.neutralGray }}>
          Packages
        </p>
        <div className="grid grid-cols-3 gap-6">
          {content.packages.map((pkg, i) => (
            <div
              key={i}
              className="p-5 rounded-2xl border space-y-4"
              style={{ backgroundColor: `${COLORS.surface}80`, borderColor: COLORS.neutralDarkGray }}
            >
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: COLORS.primary }}>
                Package {i + 1} {pkg.popular ? "(Popular)" : ""}
              </p>

              <FieldSet label="Title">
                <input
                  value={pkg.title}
                  onChange={(e) => updatePackage(i, { ...pkg, title: e.target.value })}
                  placeholder="Whisper Message"
                  className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.neutralDarkGray}`,
                    color: COLORS.neutralWhite,
                  }}
                />
              </FieldSet>

              <div className="grid grid-cols-2 gap-4">
                <FieldSet label="Price (USD)">
                  <input
                    value={pkg.price}
                    onChange={(e) =>
                      updatePackage(i, {
                        ...pkg,
                        price: e.target.value,
                      })
                    }
                    placeholder="15"
                    className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                    style={{
                      backgroundColor: COLORS.surface,
                      border: `1px solid ${COLORS.neutralDarkGray}`,
                      color: COLORS.neutralWhite,
                    }}
                  />
                </FieldSet>

                <FieldSet label="Points">
                  <input
                    type="number"
                    value={pkg.points}
                    onChange={(e) =>
                      updatePackage(i, {
                        ...pkg,
                        points: Number(e.target.value),
                      })
                    }
                    placeholder="150"
                    className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                    style={{
                      backgroundColor: COLORS.surface,
                      border: `1px solid ${COLORS.neutralDarkGray}`,
                      color: COLORS.neutralWhite,
                    }}
                  />
                </FieldSet>
              </div>

              <FieldSet label="Tagline">
                <textarea
                  value={pkg.tagline}
                  onChange={(e) => updatePackage(i, { ...pkg, tagline: e.target.value })}
                  placeholder="A quiet message from spirit, just for you."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl outline-none transition-all resize-none"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.neutralDarkGray}`,
                    color: COLORS.neutralWhite,
                  }}
                />
              </FieldSet>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>
                    Features
                  </span>
                  <button
                    onClick={() => addFeature(i)}
                    className="text-[10px] px-2 py-1 rounded-lg font-bold uppercase tracking-wider"
                    style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
                  >
                    + Add
                  </button>
                </div>
                <div className="space-y-2">
                  {pkg.features.map((feat, fi) => (
                    <div key={fi} className="flex items-center gap-2">
                      <input
                        value={feat}
                        onChange={(e) => updateFeature(i, fi, e.target.value)}
                        placeholder={`Feature ${fi + 1}`}
                        className="flex-1 px-3 py-2 rounded-lg outline-none transition-all text-sm"
                        style={{
                          backgroundColor: COLORS.surface,
                          border: `1px solid ${COLORS.neutralDarkGray}`,
                          color: COLORS.neutralWhite,
                        }}
                      />
                      <button
                        onClick={() => removeFeature(i, fi)}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-all"
                        style={{ color: COLORS.error }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <FieldSet label="Footer quote">
                <textarea
                  value={pkg.footer}
                  onChange={(e) => updatePackage(i, { ...pkg, footer: e.target.value })}
                  placeholder="Perfect for when you need one clear answer."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl outline-none transition-all resize-none"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.neutralDarkGray}`,
                    color: COLORS.neutralWhite,
                  }}
                />
              </FieldSet>

              <FieldSet label="CTA">
                <input
                  value={pkg.cta}
                  onChange={(e) => updatePackage(i, { ...pkg, cta: e.target.value })}
                  placeholder="Receive My Whisper Message"
                  className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.neutralDarkGray}`,
                    color: COLORS.neutralWhite,
                  }}
                />
              </FieldSet>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pkg.popular}
                    onChange={(e) => updatePackage(i, { ...pkg, popular: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: COLORS.neutralGray }}>
                    Popular
                  </span>
                </label>

                {pkg.popular && (
                  <FieldSet label="Badge label">
                    <input
                      value={pkg.label}
                      onChange={(e) => updatePackage(i, { ...pkg, label: e.target.value })}
                      placeholder="Most Chosen..."
                      className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                      style={{
                        backgroundColor: COLORS.surface,
                        border: `1px solid ${COLORS.neutralDarkGray}`,
                        color: COLORS.neutralWhite,
                      }}
                    />
                  </FieldSet>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

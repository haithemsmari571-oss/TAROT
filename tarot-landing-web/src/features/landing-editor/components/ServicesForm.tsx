import { COLORS } from "../../../theme";
import type { ServiceContent, ServiceCard, StatItem } from "../types/landingEditor.types";
import { FieldSet } from "./FieldSet";

interface ServicesFormProps {
  content: ServiceContent;
  onChange: (content: ServiceContent) => void;
}

export const ServicesForm = ({ content, onChange }: ServicesFormProps) => {
  const updateField = (field: keyof ServiceContent, value: unknown) => {
    onChange({ ...content, [field]: value });
  };

  const updateCard = (index: number, card: ServiceCard) => {
    const cards = [...content.cards];
    cards[index] = card;
    updateField("cards", cards);
  };

  const updateStat = (index: number, stat: StatItem) => {
    const stats = [...content.stats];
    stats[index] = stat;
    updateField("stats", stats);
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
            placeholder="What you'll"
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
            placeholder="Receive"
            className="w-full px-4 py-3 rounded-xl outline-none transition-all"
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.neutralDarkGray}`,
              color: COLORS.neutralWhite,
            }}
          />
        </FieldSet>
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: COLORS.neutralGray }}>
          Service Cards
        </p>
        <div className="grid grid-cols-2 gap-6">
          {content.cards.map((card, i) => (
            <div
              key={i}
              className="p-5 rounded-2xl border space-y-4"
              style={{ backgroundColor: `${COLORS.surface}80`, borderColor: COLORS.neutralDarkGray }}
            >
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: COLORS.primary }}>
                Card {i + 1}
              </p>

              <FieldSet label="Icon (Iconify name)">
                <input
                  value={card.icon}
                  onChange={(e) => updateCard(i, { ...card, icon: e.target.value })}
                  placeholder="ph:star-four-fill"
                  className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.neutralDarkGray}`,
                    color: COLORS.neutralWhite,
                  }}
                />
              </FieldSet>

              <FieldSet label="Title (use \\n for line break)">
                <textarea
                  value={card.title}
                  onChange={(e) => updateCard(i, { ...card, title: e.target.value })}
                  placeholder="Personal\nReading"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl outline-none transition-all resize-none"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.neutralDarkGray}`,
                    color: COLORS.neutralWhite,
                  }}
                />
              </FieldSet>

              <FieldSet label="Description">
                <textarea
                  value={card.desc}
                  onChange={(e) => updateCard(i, { ...card, desc: e.target.value })}
                  placeholder="Direct answers to your specific soul questions..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl outline-none transition-all resize-none"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.neutralDarkGray}`,
                    color: COLORS.neutralWhite,
                  }}
                />
              </FieldSet>

              <FieldSet label="Energy label">
                <input
                  value={card.energy}
                  onChange={(e) => updateCard(i, { ...card, energy: e.target.value })}
                  placeholder="High Focus"
                  className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.neutralDarkGray}`,
                    color: COLORS.neutralWhite,
                  }}
                />
              </FieldSet>
            </div>
          ))}
        </div>
      </div>

      <FieldSet label="CTA Button text">
        <input
          value={content.cta}
          onChange={(e) => updateField("cta", e.target.value)}
          placeholder="Claim Your Destiny"
          className="w-full px-4 py-3 rounded-xl outline-none transition-all"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.neutralDarkGray}`,
            color: COLORS.neutralWhite,
          }}
        />
      </FieldSet>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: COLORS.neutralGray }}>
          Footer Stats
        </p>
        <div className="grid grid-cols-3 gap-6">
          {content.stats.map((stat, i) => (
            <div
              key={i}
              className="p-4 rounded-2xl border space-y-3"
              style={{ backgroundColor: `${COLORS.surface}80`, borderColor: COLORS.neutralDarkGray }}
            >
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: COLORS.secondary }}>
                Stat {i + 1}
              </p>
              <FieldSet label="Label">
                <input
                  value={stat.label}
                  onChange={(e) => updateStat(i, { ...stat, label: e.target.value })}
                  placeholder="Turnaround"
                  className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.neutralDarkGray}`,
                    color: COLORS.neutralWhite,
                  }}
                />
              </FieldSet>
              <FieldSet label="Value">
                <input
                  value={stat.value}
                  onChange={(e) => updateStat(i, { ...stat, value: e.target.value })}
                  placeholder="24-48 Hours"
                  className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.neutralDarkGray}`,
                    color: COLORS.neutralWhite,
                  }}
                />
              </FieldSet>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

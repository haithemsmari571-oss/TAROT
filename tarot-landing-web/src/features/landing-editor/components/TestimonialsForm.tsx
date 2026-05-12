import { COLORS } from "../../../theme";
import type { TestimonialContent, TestimonialItem } from "../types/landingEditor.types";
import { FieldSet } from "./FieldSet";

interface TestimonialsFormProps {
  content: TestimonialContent;
  onChange: (content: TestimonialContent) => void;
}

export const TestimonialsForm = ({ content, onChange }: TestimonialsFormProps) => {
  const addTestimonial = () => {
    onChange({
      ...content,
      testimonials: [...content.testimonials, { name: "", role: "", content: "" }],
    });
  };

  const removeTestimonial = (index: number) => {
    onChange({
      ...content,
      testimonials: content.testimonials.filter((_, i) => i !== index),
    });
  };

  const updateTestimonial = (index: number, field: keyof TestimonialItem, value: string) => {
    const list = [...content.testimonials];
    list[index] = { ...list[index], [field]: value };
    onChange({ ...content, testimonials: list });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>
          {content.testimonials.length} testimonial{content.testimonials.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={addTestimonial}
          className="px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all hover:scale-[1.02]"
          style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
        >
          + Add Testimonial
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {content.testimonials.map((item, i) => (
          <div
            key={i}
            className="p-5 rounded-2xl border space-y-4 relative"
            style={{ backgroundColor: `${COLORS.surface}80`, borderColor: COLORS.neutralDarkGray }}
          >
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: COLORS.secondary }}>
                #{i + 1}
              </p>
              <button
                onClick={() => removeTestimonial(i)}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-all"
                style={{ color: COLORS.error }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FieldSet label="Name">
                <input
                  value={item.name}
                  onChange={(e) => updateTestimonial(i, "name", e.target.value)}
                  placeholder="Aria Vance"
                  className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.neutralDarkGray}`,
                    color: COLORS.neutralWhite,
                  }}
                />
              </FieldSet>

              <FieldSet label="Role">
                <input
                  value={item.role}
                  onChange={(e) => updateTestimonial(i, "role", e.target.value)}
                  placeholder="Soul Seeker"
                  className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.neutralDarkGray}`,
                    color: COLORS.neutralWhite,
                  }}
                />
              </FieldSet>
            </div>

            <FieldSet label="Content">
              <textarea
                value={item.content}
                onChange={(e) => updateTestimonial(i, "content", e.target.value)}
                placeholder="The reading felt like she was reading the very blueprint of my heart."
                rows={3}
                className="w-full px-4 py-3 rounded-xl outline-none transition-all resize-none"
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
  );
};

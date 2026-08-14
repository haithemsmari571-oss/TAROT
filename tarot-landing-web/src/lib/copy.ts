// Public-site copy guard. The site must never make accuracy/certainty claims —
// readings are for guidance and entertainment. Marketing surfaces (hero,
// testimonials) can be overridden by DB-driven landing content, so banned
// phrases are replaced at render time as well as in the shipped defaults.

const REPLACEMENTS: [RegExp, string][] = [
  [/divine truth/gi, "Gentle Clarity"],
  [/insights? you can trust/gi, "perspective that steadies you"],
  [/reveal the deeper truths that matter most/gi, "find the clarity and comfort that matter most"],
  [/deeper truths/gi, "quiet questions"],
  [/piercingly accurate/gi, "piercingly clear"],
  [/unfiltered accuracy/gi, "unfiltered honesty"],
  [/\b100% accurate\b/gi, "deeply considered"],
  [/\baccurate readings?\b/gi, "thoughtful readings"],
  [/guaranteed (answers|results)/gi, "a calm, honest space"],
  // Blanket accuracy vocabulary (kept last so the specific phrases above win):
  // noun-for-noun and adjective-for-adjective, so sentences stay grammatical.
  [/\baccuracy\b/gi, "clarity"],
  [/\baccurate\b/gi, "clear"],
];

/** Replace accuracy/certainty claims in display copy with clarity/comfort wording. */
export function sanitizeClaims(text: string | undefined | null): string {
  if (!text) return "";
  let out = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

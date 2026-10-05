/* A reader's profile under her name (ROUND54), and a sign's glyph, which the
   owner's sign chips draw too. The readings are readerProfile.ts's. */
import type { Psychic } from "@/features/browse/types/psychic.types";
import { speaksLine, yearsReadingLine, zodiacSignOf, type ZodiacSign } from "./readerProfile";

/* Draws a zodiac glyph as text, never as a coloured emoji. */
const TEXT_PRESENTATION = "︎";

export function ZodiacGlyph({ sign }: { sign: ZodiacSign }) {
  return <span className="reader-zodiac-glyph" aria-hidden="true">{sign.symbol}{TEXT_PRESENTATION}</span>;
}

/* Sign, years reading, languages, ethnicity; a field left empty says nothing. */
export default function ReaderFacts({ reader }: { reader: Pick<Psychic, "zodiac_sign" | "years_experience" | "languages" | "ethnicity"> }) {
  const sign = zodiacSignOf(reader.zodiac_sign);
  const facts = [
    sign && <><ZodiacGlyph sign={sign} /> {sign.name}</>,
    yearsReadingLine(reader.years_experience),
    speaksLine(reader.languages),
    reader.ethnicity || null,
  ].filter(Boolean);
  if (facts.length === 0) return null;
  return (
    <ul className="client-reader-facts">
      {facts.map((fact, index) => <li key={index}>{fact}</li>)}
    </ul>
  );
}

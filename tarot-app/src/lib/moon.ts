// Tonight's moon — phase, illumination, and the zodiac sign the moon sits in.
// Pure JS (no dependency): entertainment-grade astronomy, accurate to within
// about a degree, which is plenty for "Moon in Scorpio" and the phase name.

export type MoonPhaseKey =
  | "new"
  | "waxing-crescent"
  | "first-quarter"
  | "waxing-gibbous"
  | "full"
  | "waning-gibbous"
  | "last-quarter"
  | "waning-crescent";

export interface MoonTonight {
  phase: MoonPhaseKey;
  phaseName: string;
  /** Large glyph used as the phase art. */
  glyph: string;
  /** 0–100, how lit the disc is. */
  illumination: number;
  /** Days into the ~29.5-day cycle. */
  age: number;
  /** Zodiac sign the moon occupies tonight, e.g. "Scorpio". */
  moonSign: string;
  /** What this phase is for — the reading. */
  meaning: string;
  /** A small, doable ritual for tonight. */
  ritual: string;
}

const SYNODIC_MONTH = 29.53058867;
// A known new moon: 2000-01-06 18:14 UTC, as a Julian date.
const NEW_MOON_JD = 2451550.26;
const J2000_JD = 2451545.0;

const ZODIAC_ORDER = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

interface PhaseContent {
  name: string;
  glyph: string;
  meaning: string;
  ritual: string;
}

const PHASES: Record<MoonPhaseKey, PhaseContent> = {
  new: {
    name: "New Moon",
    glyph: "🌑",
    meaning:
      "The sky is dark on purpose. This is the blank page of the month — nothing is decided yet, and that is the gift. Whatever you plant quietly now has the whole cycle to grow.",
    ritual:
      "Write one intention on a slip of paper — just one — and put it somewhere only you will see it. Don't share it. New moon wishes are kept, not spoken.",
  },
  "waxing-crescent": {
    name: "Waxing Crescent",
    glyph: "🌒",
    meaning:
      "The first sliver of light returns. Intentions set at the new moon are taking their first fragile steps — this is the phase of small beginnings that don't look like much yet.",
    ritual:
      "Take one small, almost embarrassingly easy step toward the thing you wished for. The moon grows by slivers, and so do you.",
  },
  "first-quarter": {
    name: "First Quarter",
    glyph: "🌓",
    meaning:
      "Half light, half shadow — the moon's decision point. Resistance tends to show up here: the doubt, the obstacle, the reason to stop. It isn't a wall. It's a test of whether you meant it.",
    ritual:
      "Name the one thing standing between you and what you set in motion. Just naming it out loud, alone, takes half its power away.",
  },
  "waxing-gibbous": {
    name: "Waxing Gibbous",
    glyph: "🌔",
    meaning:
      "Almost full, not quite. This is the refining phase — the universe asking you to adjust, patch, and polish rather than push. What you're waiting for is closer than it feels.",
    ritual:
      "Tidy one corner of your life tonight — a drawer, an inbox, a worry. Make room for what the full moon is bringing.",
  },
  full: {
    name: "Full Moon",
    glyph: "🌕",
    meaning:
      "Everything is illuminated — including the things you'd rather not look at. Full moons bring matters to a head: feelings peak, truths surface, and what's been building all month finally shows itself.",
    ritual:
      "Stand where you can see the moon, even through glass, and let yourself feel whatever is loudest tonight. Full moons reward honesty, not composure.",
  },
  "waning-gibbous": {
    name: "Waning Gibbous",
    glyph: "🌖",
    meaning:
      "The light begins to soften. This is the gratitude phase — the exhale after the full moon's crescendo. What did the light show you? That knowledge is yours to keep.",
    ritual:
      "Before sleep, name three things this month has already given you. Waning moons return what you appreciate.",
  },
  "last-quarter": {
    name: "Last Quarter",
    glyph: "🌗",
    meaning:
      "Half the light has gone, and it's asking you to let something go with it. Forgiveness, an old habit, a grudge that's been paying no rent — this is the moon for releasing.",
    ritual:
      "Choose one thing you're done carrying. Write it down, then tear the paper. The moon takes it from here.",
  },
  "waning-crescent": {
    name: "Waning Crescent",
    glyph: "🌘",
    meaning:
      "The last sliver before the dark. Rest is not a reward for finishing — it's part of the cycle. The moon disappears every month and no one calls her lazy.",
    ritual:
      "Do less tonight, deliberately. An early night, a slow bath, a closed door. You are allowed to wane.",
  },
};

/** Current Julian date. */
function julianNow(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function normalizeDegrees(d: number): number {
  return ((d % 360) + 360) % 360;
}

/**
 * Ecliptic longitude of the moon (degrees), truncated Meeus series — mean
 * longitude plus the largest correction term. ~1° accuracy, ample for the
 * sign the moon is in.
 */
function moonLongitude(jd: number): number {
  const d = jd - J2000_JD;
  const L = 218.316 + 13.176396 * d; // mean longitude
  const M = 134.963 + 13.064993 * d; // mean anomaly
  return normalizeDegrees(L + 6.289 * Math.sin((M * Math.PI) / 180));
}

/** Everything the Moon screen shows, computed for a given moment. */
export function moonTonight(date: Date = new Date()): MoonTonight {
  const jd = julianNow(date);

  // Days into the synodic cycle since a known new moon.
  const age =
    (((jd - NEW_MOON_JD) % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;

  const illumination = Math.round(
    ((1 - Math.cos((2 * Math.PI * age) / SYNODIC_MONTH)) / 2) * 100
  );

  // Eight equal slices, centred on the cardinal moments (new/quarters/full).
  const KEYS: MoonPhaseKey[] = [
    "new",
    "waxing-crescent",
    "first-quarter",
    "waxing-gibbous",
    "full",
    "waning-gibbous",
    "last-quarter",
    "waning-crescent",
  ];
  const phase = KEYS[Math.round((age / SYNODIC_MONTH) * 8) % 8];

  const moonSign = ZODIAC_ORDER[Math.floor(moonLongitude(jd) / 30)];

  const content = PHASES[phase];
  return {
    phase,
    phaseName: content.name,
    glyph: content.glyph,
    illumination,
    age,
    moonSign,
    meaning: content.meaning,
    ritual: content.ritual,
  };
}

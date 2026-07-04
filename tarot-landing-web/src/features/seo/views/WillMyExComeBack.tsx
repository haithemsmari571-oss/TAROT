import SeoArticlePage, {
  type SeoArticleContent,
} from "../components/SeoArticlePage";

// TODO(phase-2): swap ctaHref + the "compatibility score" related link to
// /love-compatibility-calculator once that page ships. Points to readers for now.
const CALCULATOR_FALLBACK = "/psychics-browse";

const content: SeoArticleContent = {
  seoPath: "/will-my-ex-come-back",
  h1: "Will My Ex Come Back?",
  intro: [
    "There's a version of this story where it's over, and a version where it isn't, and right now you're carrying both at once. You replay the last conversation looking for the line that proves which one it was. You haven't found it. That's not because you're missing something obvious. It's because the answer was never sitting in what was said.",
  ],
  shortAnswer: [
    "Some connections do come back around — not because of a grand gesture, but because the original pull between two people never actually resolved. Others don't, because what ended wasn't timing, it was incompatibility wearing a timing costume. The difference shows up less in what he says now and more in what was actually unfinished between you when it ended.",
  ],
  whyThisHappens: [
    "Breakups rarely close as cleanly as either person wants. When someone leaves because of circumstance — distance, timing, outside pressure — the emotional connection often stays intact even after the relationship ends, which is exactly the kind of ending that tends to reopen. When someone leaves because of a values mismatch or because the relationship asked them to be someone they aren't, the ending tends to hold, even if the missing is real.",
    "Element also shapes how a return tends to look. Water signs — Cancer, Scorpio, Pisces — often circle back emotionally even after a logical decision to leave. Air signs — Gemini, Libra, Aquarius — usually need a new narrative or a changed perspective before they'll return. Fire signs — Aries, Leo, Sagittarius — tend to come back abruptly, when something reignites pride or desire rather than nostalgia. Earth signs — Taurus, Virgo, Capricorn — return slowest, and usually only once a real, practical circumstance has changed.",
  ],
  signs: [
    "He left over circumstance rather than over who you are or what you valued.",
    "He still references shared memories unprompted, even in passing.",
    "He hasn't fully detached from shared social ties — your friends, your routines, the places you overlapped.",
    "Contact attempts cluster around meaningful dates — a song, an anniversary, a season — rather than appearing randomly.",
    "He asks questions clearly designed to find out if you're seeing someone, without asking directly.",
  ],
  cards: [
    "The Six of Cups points to nostalgia pulling someone backward toward something familiar. The Ten of Cups reversed describes an ending that looked complete on the surface but left real emotional business unfinished. The Wheel of Fortune signals cycles returning and timing realigning — not certainty, but a window where movement becomes more likely.",
  ],
  whatToDoNext: [
    "Stop auditioning for the comeback. Making yourself smaller, easier, or constantly available doesn't speed up a genuine return — it usually just delays your own clarity. If a return is going to happen, let it be led by him actually changing something real, not by you performing a version of yourself built to be easy to come back to.",
  ],
  ctaHeading: "Get Your Free Compatibility Score",
  ctaBody:
    "See the emotional pattern between you — what kept this connection alive, what actually ended it, and what the timing window for a possible return looks like.",
  ctaButtonLabel: "Speak to a Reader",
  ctaHref: CALCULATOR_FALLBACK,
  faqs: [
    {
      q: "Do exes usually come back after a breakup?",
      a: "Some do, particularly when the split was driven by circumstance rather than character or values. There's no universal rule — it depends on what was actually unresolved.",
    },
    {
      q: "How do I know if he's thinking about getting back together?",
      a: "Look at consistent, specific behavior over time rather than any single message. A reading can help you separate genuine reconsideration from habit or boredom.",
    },
    {
      q: "Should I reach out first?",
      a: "Sometimes, but timing and tone matter more than the decision itself. A message that opens a door reads very differently from one that hands over your power — we can help you see which one you're about to send.",
    },
    {
      q: "What if he's already seeing someone else?",
      a: "That doesn't automatically close the door, but it changes the timing and the approach. This is exactly the kind of nuance a reading is built to address directly.",
    },
    {
      q: "Can a reading actually tell me if he's coming back?",
      a: "A reading explores the emotional pattern, the likely timing window, and what's realistically in motion — it offers clarity and guidance, not a guaranteed outcome.",
    },
  ],
  related: [
    { label: "Get your free compatibility score", href: CALCULATOR_FALLBACK },
    { label: "Does He Miss Me During No Contact?", href: "/does-he-miss-me" },
    { label: "Browse our readers", href: "/psychics-browse" },
  ],
};

export default function WillMyExComeBack() {
  return <SeoArticlePage content={content} />;
}

import SeoArticlePage, {
  type SeoArticleContent,
} from "../components/SeoArticlePage";

// TODO(phase-2): swap ctaHref + the "compatibility score" related link to
// /love-compatibility-calculator once that page ships. Points to readers for now.
const CALCULATOR_FALLBACK = "/psychics-browse";

const content: SeoArticleContent = {
  seoPath: "/does-he-miss-me",
  h1: "Does He Miss Me During No Contact?",
  intro: [
    "You check your phone before you're even fully awake. Not because you're expecting something. Because some part of you is still hoping. The silence has a shape now. You know exactly how long it's been — not roughly, exactly — and you hate that you know.",
  ],
  shortAnswer: [
    "Yes, in most cases — but not in the way you're picturing it. Men tend to feel absence on a delay. The silence that feels unbearable to you right now is often the exact thing starting to work on him. That doesn't mean wait passively and hope. It means understanding what's actually happening on his side of the quiet, and not mistaking his pace for his answer.",
  ],
  whyThisHappens: [
    "Most men aren't taught to sit with an uncomfortable feeling and name it in real time. They're taught to act, fix, or disappear until the feeling becomes manageable. No contact doesn't erase what he felt for you — it removes the noise that was letting him avoid feeling it. For a lot of men, that's when the missing actually starts, not when it ends.",
    "Timing also depends on temperament. Fixed signs — Taurus, Leo, Scorpio, Aquarius — tend to sit with a feeling far longer before they let it show, sometimes weeks past when you'd expect movement. Cardinal signs — Aries, Cancer, Libra, Capricorn — move fast once they've decided something, for better or worse. Mutable signs — Gemini, Virgo, Sagittarius, Pisces — often don't know what they feel until something forces the question. None of this guarantees a timeline. It explains why two situations that look identical on the surface can unfold completely differently underneath.",
  ],
  signs: [
    "He views your stories within minutes of posting, but never engages.",
    "He reaches out to mutual friends with questions that aren't really about them.",
    "Old photos or old messages get a like, weeks later — like he scrolled back further than he meant to.",
    "A sudden profile change — new photo, updated bio — timed strangely close to when things went quiet.",
    "A text that starts, stalls, and never sends. Read receipts and online-status patterns often tell you more than any message would.",
  ],
  cards: [
    "The Eight of Cups shows someone walking away from something that looks resolved on the outside but isn't finished underneath. The Two of Cups reversed points to a connection that closed in conversation but never closed emotionally. The Knight of Swords describes someone who left fast and with conviction — not someone built to look back gently, but not someone immune to the pull either.",
  ],
  whatToDoNext: [
    "Resist the urge to check, test, or interpret his every move from a distance — it keeps you in his timeline instead of your own. Set a real no-contact window and hold it, not as a strategy to make him chase you, but because your own steadiness is the thing that actually changes the dynamic. Let your silence stay silence. Don't post it, explain it, or perform it for him to notice.",
  ],
  ctaHeading: "Get Your Free Compatibility Score",
  ctaBody:
    "See the emotional pattern underneath the silence — what's likely keeping him quiet, and what tends to break that kind of quiet open. Talk to a reader who can walk you through it.",
  ctaButtonLabel: "Speak to a Reader",
  ctaHref: CALCULATOR_FALLBACK,
  faqs: [
    {
      q: 'How long does no contact usually take to "work"?',
      a: "There's no fixed number — it depends on the person and the history between you. What matters more than the exact day count is what's happening underneath the silence, which is what a reading looks at directly.",
    },
    {
      q: "Does he think about me during no contact?",
      a: "Often, yes, especially if the connection had real depth. But thinking about someone and being ready to act on it are two different stages, and they don't always arrive together.",
    },
    {
      q: "Should I check his social media during no contact?",
      a: "Occasional awareness is human. Constant checking usually keeps you anxious without giving you real information — most of what matters is happening in places a profile won't show you.",
    },
    {
      q: "What if he doesn't reach out at all?",
      a: "Silence isn't always a verdict. Some people need the absence to fully register before they're able to act on it. A reading can help you see whether this is that, or something else.",
    },
    {
      q: "Is no contact the same as him moving on?",
      a: "Not necessarily. Moving on and going quiet can look identical from the outside. What separates them is usually visible in the small, specific behaviors — which is exactly what we look at in a reading.",
    },
  ],
  related: [
    { label: "Get your free compatibility score", href: CALCULATOR_FALLBACK },
    { label: "Will My Ex Come Back?", href: "/will-my-ex-come-back" },
    { label: "Browse our readers", href: "/psychics-browse" },
  ],
};

export default function DoesHeMissMe() {
  return <SeoArticlePage content={content} />;
}

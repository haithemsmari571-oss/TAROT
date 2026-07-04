// Single source of truth for per-route SEO metadata.
//
// Both the client-side <Seo> component (src/components/Seo.tsx) and the
// build-time prerenderer (src/entry-server.tsx + scripts/prerender.mjs) read
// from this map, so a crawler and a live visitor always see the same title,
// description, canonical and Open Graph tags for a given path.

export const SITE_URL = "https://askvalentina.co.uk";
export const SITE_NAME = "Ask Valentina";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/logo.svg`;

export interface JsonLd {
  [key: string]: unknown;
}

export interface SeoMeta {
  /** Full <title>. Convention: "[Page topic] | Ask Valentina". */
  title: string;
  description: string;
  /** Path only, e.g. "/does-he-miss-me". Canonical is SITE_URL + path. */
  path: string;
  /** Absolute Open Graph image URL. Falls back to DEFAULT_OG_IMAGE. */
  ogImage?: string;
  ogType?: "website" | "article";
  /** Optional JSON-LD blocks (e.g. FAQPage) injected into <head>. */
  jsonLd?: JsonLd[];
}

export const DEFAULT_SEO: SeoMeta = {
  title: "Private Love Readings & Tarot Clarity | Ask Valentina",
  description:
    "Private, judgment-free love and tarot readings with intuitive readers. Get clarity on him, your relationship and what happens next.",
  path: "/",
  ogType: "website",
};

export const SEO: Record<string, SeoMeta> = {
  "/": {
    path: "/",
    title: "Private Love Readings & Tarot Clarity | Ask Valentina",
    description:
      "Private love and tarot readings for the connection you cannot stop thinking about. Talk to an intuitive reader and get clarity on him, your relationship and what comes next.",
    ogType: "website",
  },
  "/psychics-browse": {
    path: "/psychics-browse",
    title: "Browse Our Psychic & Tarot Readers | Ask Valentina",
    description:
      "Meet our intuitive love and tarot readers. Choose the reader who feels right and start a private one-to-one reading whenever you're ready.",
    ogType: "website",
  },
  "/about": {
    path: "/about",
    title: "About Ask Valentina | Private Intuitive Readings",
    description:
      "Ask Valentina is a sanctuary for private, honest love and tarot readings. Learn about our readers and how we help you find clarity.",
    ogType: "website",
  },
  "/404": {
    path: "/404",
    title: "Page Not Found | Ask Valentina",
    description: "This page has drifted out of orbit. Find your way back to Ask Valentina.",
    ogType: "website",
  },
  "/does-he-miss-me": {
    path: "/does-he-miss-me",
    title: "Does He Miss Me During No Contact? | Ask Valentina",
    description:
      "Does he miss you during no contact? Understand what's really happening on his side of the silence, the signs he's thinking of you, and what to do next.",
    ogType: "article",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: 'How long does no contact usually take to "work"?',
            acceptedAnswer: {
              "@type": "Answer",
              text: "There's no fixed number — it depends on the person and the history between you. What matters more than the exact day count is what's happening underneath the silence, which is what a reading looks at directly.",
            },
          },
          {
            "@type": "Question",
            name: "Does he think about me during no contact?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Often, yes, especially if the connection had real depth. But thinking about someone and being ready to act on it are two different stages, and they don't always arrive together.",
            },
          },
          {
            "@type": "Question",
            name: "Should I check his social media during no contact?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Occasional awareness is human. Constant checking usually keeps you anxious without giving you real information — most of what matters is happening in places a profile won't show you.",
            },
          },
          {
            "@type": "Question",
            name: "What if he doesn't reach out at all?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Silence isn't always a verdict. Some people need the absence to fully register before they're able to act on it. A reading can help you see whether this is that, or something else.",
            },
          },
          {
            "@type": "Question",
            name: "Is no contact the same as him moving on?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Not necessarily. Moving on and going quiet can look identical from the outside. What separates them is usually visible in the small, specific behaviors — which is exactly what we look at in a reading.",
            },
          },
        ],
      },
    ],
  },
  "/will-my-ex-come-back": {
    path: "/will-my-ex-come-back",
    title: "Will My Ex Come Back? | Ask Valentina",
    description:
      "Will your ex come back? See what tends to bring a connection back around, the signs to look for, and how to read the timing — with a private love reading.",
    ogType: "article",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Do exes usually come back after a breakup?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Some do, particularly when the split was driven by circumstance rather than character or values. There's no universal rule — it depends on what was actually unresolved.",
            },
          },
          {
            "@type": "Question",
            name: "How do I know if he's thinking about getting back together?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Look at consistent, specific behavior over time rather than any single message. A reading can help you separate genuine reconsideration from habit or boredom.",
            },
          },
          {
            "@type": "Question",
            name: "Should I reach out first?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Sometimes, but timing and tone matter more than the decision itself. A message that opens a door reads very differently from one that hands over your power — we can help you see which one you're about to send.",
            },
          },
          {
            "@type": "Question",
            name: "What if he's already seeing someone else?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "That doesn't automatically close the door, but it changes the timing and the approach. This is exactly the kind of nuance a reading is built to address directly.",
            },
          },
          {
            "@type": "Question",
            name: "Can a reading actually tell me if he's coming back?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "A reading explores the emotional pattern, the likely timing window, and what's realistically in motion — it offers clarity and guidance, not a guaranteed outcome.",
            },
          },
        ],
      },
    ],
  },
};

/** Look up metadata for a path, falling back to sensible defaults. */
export function getSeo(path: string): SeoMeta {
  const clean = path.replace(/\/+$/, "") || "/";
  return SEO[clean] ?? { ...DEFAULT_SEO, path: clean };
}

/** Absolute canonical URL for a path. */
export function canonicalUrl(path: string): string {
  const clean = path.replace(/\/+$/, "") || "/";
  return clean === "/" ? `${SITE_URL}/` : `${SITE_URL}${clean}`;
}

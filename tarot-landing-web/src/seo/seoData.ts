// Single source of truth for per-route SEO metadata.
//
// Both the client-side <Seo> component (src/components/Seo.tsx) and the
// build-time prerenderer (src/entry-server.tsx + scripts/prerender.mjs) read
// from this map, so a crawler and a live visitor always see the same title,
// description, canonical and Open Graph tags for a given path.
//
// index.html carries the same defaults as static tags (DEFAULT_SEO and the share
// image below) for the crawlers that never run the app: WhatsApp, Instagram,
// Facebook and X read only the served HTML.

import { COMPANY_NAME } from "../lib/company";

export const SITE_URL = "https://askvalentina.co.uk";
export const SITE_NAME = "Ask Valentina";
/** The share image: public/og-image.jpg, 1200x630, the app's sky and the
    wordmark (made by relay/round41-evidence/og_image.cjs). */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.jpg`;
export const DEFAULT_OG_IMAGE_WIDTH = 1200;
export const DEFAULT_OG_IMAGE_HEIGHT = 630;
export const DEFAULT_OG_IMAGE_ALT = SITE_NAME;
/** Pages kept out of search: sign-in, sign-up, the app and the account links. */
export const NOINDEX = "noindex";

export interface JsonLd {
  [key: string]: unknown;
}

export interface SeoMeta {
  /** Full <title>. Convention: "[Page topic] | Ask Valentina". */
  title: string;
  description: string;
  /** Path only, e.g. "/does-he-miss-me". Canonical is SITE_URL + path. */
  path: string;
  /** Absolute override for editorial pages; normally derived from path. */
  canonical?: string;
  /** Defaults to index,follow. Loading/missing/private states use noindex. */
  robots?: string;
  /** Absolute Open Graph image URL. Falls back to DEFAULT_OG_IMAGE. */
  ogImage?: string;
  ogType?: "website" | "article";
  /** Optional JSON-LD blocks (e.g. FAQPage) injected into <head>. */
  jsonLd?: JsonLd[];
}

/** The site's default title and description: the ones index.html serves on
    every page that has none of its own. */
export const DEFAULT_SEO: SeoMeta = {
  title: "Private Love Readings & Tarot Clarity | Ask Valentina",
  description:
    "Private, judgment-free love and tarot readings with intuitive readers — your first reading is on us. Get clarity on him, your relationship and what happens next.",
  path: "/",
  ogType: "website",
};

export const SEO: Record<string, SeoMeta> = {
  "/": {
    path: "/",
    title: "Private Love Readings & Tarot Clarity | Ask Valentina",
    description:
      "Private love and tarot readings for the connection you cannot stop thinking about. Your first reading is on us. Talk to an intuitive reader and get clarity on him, your relationship and what comes next.",
    ogType: "website",
  },
  "/home": {
    path: "/home",
    title: "Ask Valentina — Live Love & Tarot Readings Online",
    description:
      "Ask Valentina connects you with gifted readers for private, one-to-one love and tarot readings. Your first reading is on us.",
    ogType: "website",
  },
  "/psychics-browse": {
    path: "/psychics-browse",
    title: "Love & Tarot Readers | Ask Valentina",
    description:
      "Browse love and tarot readers, see their reviews and prices, and start a private reading by message.",
    ogType: "website",
  },
  "/about": {
    path: "/about",
    title: "About Ask Valentina",
    description: `Private love and tarot readings by message, from ${COMPANY_NAME} in London.`,
    ogType: "website",
  },
  "/terms": {
    path: "/terms",
    title: "Terms of Service | Ask Valentina",
    description: "The terms for using Ask Valentina.",
    ogType: "website",
  },
  "/privacy": {
    path: "/privacy",
    title: "Privacy Policy | Ask Valentina",
    description: "How Ask Valentina collects, uses and protects your information.",
    ogType: "website",
  },
  "/login": {
    path: "/login",
    title: "Sign in | Ask Valentina",
    description: DEFAULT_SEO.description,
    robots: NOINDEX,
    ogType: "website",
  },
  "/register": {
    path: "/register",
    title: "Create your account | Ask Valentina",
    description: "Create your free account and start your first private reading.",
    robots: NOINDEX,
    ogType: "website",
  },
  // Guest pages with no words of their own in the brief: the page's h1 and its
  // first intro sentence, word for word (ROUND41).
  "/oracle": {
    path: "/oracle",
    title: "Cosmic Compatibility | Ask Valentina",
    description:
      "Discover how the stars aligned at your birth — and what that means for love, communication, emotional bonds, and your soul's unique journey.",
    ogType: "website",
  },
  "/forgot-password": {
    path: "/forgot-password",
    title: "Reset your password | Ask Valentina",
    description: "Enter your email to receive password reset instructions.",
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
  "/articles": {
    path: "/articles",
    canonical: `${SITE_URL}/articles/`,
    title: "Articles | Ask Valentina",
    description:
      "Read Ask Valentina articles about numerology, tarot, love and relationships, and psychic guidance.",
  },
};

/** A reader's profile, /psychics/:id/details. The name is the one the page shows. */
export function readerSeo(id: number, name: string): SeoMeta {
  return {
    path: `/psychics/${id}/details`,
    title: `${name}, Love & Tarot Reader | Ask Valentina`,
    description: `See ${name}'s reviews, specialities and price per message, then start a private reading.`,
    ogType: "website",
  };
}

/** A page kept out of search: the site's default title and description, its
    own canonical, noindex. */
export function noindexSeo(path: string): SeoMeta {
  return { ...DEFAULT_SEO, path, robots: NOINDEX };
}

/** Look up metadata for a path, falling back to sensible defaults. */
export function getSeo(path: string): SeoMeta {
  const clean = path.replace(/\/+$/, "") || "/";
  return SEO[clean] ?? { ...DEFAULT_SEO, path: clean };
}

/** Absolute canonical URL for a path. One slash rule for every page the app
    draws: the site address and the path with no trailing slash (the root keeps
    its one "/"). The sitemap (TAROT-BACKEND app/routers/public_seo.py) lists the
    same form, and nginx answers each of them 200 with no redirect. */
export function canonicalUrl(path: string): string {
  const clean = path.replace(/\/+$/, "") || "/";
  return clean === "/" ? `${SITE_URL}/` : `${SITE_URL}${clean}`;
}

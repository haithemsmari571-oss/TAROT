// Reusable template for long-form SEO content pages (e.g. /does-he-miss-me).
// Pure + SSR-safe: no window access, no data fetching, no animation libs, so it
// prerenders to real HTML. Add a new page by creating a thin wrapper that passes
// SeoArticleContent into this template (see DoesHeMissMe.tsx).
import { Link } from "react-router-dom";
import { Icon } from "@iconify/react";
import Seo from "../../../components/Seo";
import "../../../styles/glass.css";

export interface FaqItem {
  q: string;
  a: string;
}

export interface RelatedLink {
  label: string;
  href: string;
}

export interface SeoArticleContent {
  /** Path used to look up <title>/meta/JSON-LD in the central SEO map. */
  seoPath: string;
  h1: string;
  /** Opening emotional hook paragraph(s). */
  intro: string[];
  shortAnswer: string[];
  whyThisHappens: string[];
  signs: string[];
  cards: string[];
  whatToDoNext: string[];
  ctaHeading: string;
  ctaBody: string;
  ctaButtonLabel: string;
  /** Where the primary CTA points. */
  ctaHref: string;
  faqs: FaqItem[];
  related: RelatedLink[];
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      {eyebrow && (
        <p className="gl-kicker" style={{ marginBottom: 10 }}>
          {eyebrow}
        </p>
      )}
      <h2 className="gl-h3 mb-4">{title}</h2>
      <div
        className="space-y-4 text-base md:text-lg leading-relaxed"
        style={{ color: "var(--gl-text-dim)" }}
      >
        {children}
      </div>
    </section>
  );
}

export default function SeoArticlePage({ content }: { content: SeoArticleContent }) {
  const isInternal = (href: string) => href.startsWith("/");

  return (
    <article
      className="mx-auto max-w-3xl px-5 md:px-6 py-12 md:py-16"
      style={{ fontFamily: "var(--gl-sans)" }}
    >
      <Seo path={content.seoPath} />

      <header className="mb-10">
        <h1 className="gl-h1" style={{ marginBottom: 24 }}>
          {content.h1}
        </h1>
        {content.intro.map((p, i) => (
          <p
            key={i}
            className="text-lg md:text-xl leading-relaxed mb-4"
            style={{ color: "var(--gl-text)" }}
          >
            {p}
          </p>
        ))}
      </header>

      <Section title="Short Answer">
        {content.shortAnswer.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </Section>

      <Section title="Why This Happens">
        {content.whyThisHappens.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </Section>

      <Section title="Signs to Look For">
        <ul className="space-y-3 list-none pl-0">
          {content.signs.map((s, i) => (
            <li key={i} className="flex gap-3">
              <Icon
                icon="ph:sparkle-fill"
                className="mt-1.5 shrink-0"
                style={{ color: "var(--gl-accent)" }}
                width={16}
                height={16}
              />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="What the Cards Show in This Energy">
        {content.cards.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </Section>

      <Section title="What to Do Next">
        {content.whatToDoNext.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </Section>

      {/* Primary CTA */}
      <div className="gl-panel gl-panel--2 p-8 my-12 text-center">
        <h2 className="gl-h3 mb-3">{content.ctaHeading}</h2>
        <p
          className="mb-3 text-base md:text-lg"
          style={{ color: "var(--gl-text-dim)" }}
        >
          {content.ctaBody}
        </p>
        <p
          className="gl-acc mb-6 flex items-center justify-center gap-1.5 text-sm font-semibold"
        >
          <Icon icon="ph:gift-fill" width={16} height={16} />
          New here? Your first £15 is free.
        </p>
        {/* TODO: point ctaHref at /love-compatibility-calculator once that page
            ships (Phase 2). For now it routes to the readers page. */}
        <Link
          to={content.ctaHref}
          className="gl-btn-solid inline-block"
          style={{ padding: "14px 34px", fontSize: 13, textDecoration: "none" }}
        >
          {content.ctaButtonLabel}
        </Link>
      </div>

      {/* FAQ */}
      <Section eyebrow="Frequently Asked Questions" title="You asked, we answered">
        <div className="space-y-6">
          {content.faqs.map((f, i) => (
            <div key={i}>
              <h3
                className="gl-serif text-lg mb-2"
                style={{ color: "var(--gl-text)", fontWeight: 400 }}
              >
                {f.q}
              </h3>
              <p>{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Related links */}
      <section className="mt-12 pt-8" style={{ borderTop: "1px solid var(--gl-hair)" }}>
        <h2 className="gl-h3 mb-4">Keep Reading</h2>
        <ul className="space-y-2">
          {content.related.map((r, i) => (
            <li key={i}>
              {isInternal(r.href) ? (
                <Link
                  to={r.href}
                  className="hover:underline"
                  style={{ color: "var(--gl-accent)" }}
                >
                  {r.label}
                </Link>
              ) : (
                <a href={r.href} className="hover:underline" style={{ color: "var(--gl-accent)" }}>
                  {r.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

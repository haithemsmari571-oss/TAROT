// Client-side head manager. Renders nothing to the DOM tree; on mount and on
// path change it imperatively syncs <title>, meta description, canonical, Open
// Graph / Twitter tags and any JSON-LD blocks — so client-side navigation keeps
// the head in step with the prerendered HTML.
import { useEffect } from "react";
import {
  canonicalUrl,
  DEFAULT_OG_IMAGE,
  getSeo,
  SITE_NAME,
  type SeoMeta,
} from "../seo/seoData";

/** Managed tags carry this attribute so we can update/remove only our own. */
const MANAGED = "data-seo-managed";

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    el.setAttribute(MANAGED, "");
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    el.setAttribute(MANAGED, "");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function applySeo(meta: SeoMeta) {
  const canonical = meta.canonical ?? canonicalUrl(meta.path);
  const ogImage = meta.ogImage ?? DEFAULT_OG_IMAGE;
  const ogType = meta.ogType ?? "website";

  document.title = meta.title;
  upsertMeta('meta[name="description"]', "name", "description", meta.description);
  upsertMeta('meta[name="robots"]', "name", "robots", meta.robots ?? "index,follow");
  upsertLink("canonical", canonical);

  upsertMeta('meta[property="og:site_name"]', "property", "og:site_name", SITE_NAME);
  upsertMeta('meta[property="og:type"]', "property", "og:type", ogType);
  upsertMeta('meta[property="og:title"]', "property", "og:title", meta.title);
  upsertMeta('meta[property="og:description"]', "property", "og:description", meta.description);
  upsertMeta('meta[property="og:url"]', "property", "og:url", canonical);
  upsertMeta('meta[property="og:image"]', "property", "og:image", ogImage);

  upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
  upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", meta.title);
  upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", meta.description);
  upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", ogImage);

  // Refresh managed JSON-LD blocks (prerender may have added static ones; keep
  // in sync on client navigation without duplicating them endlessly).
  document.head
    .querySelectorAll(`script[type="application/ld+json"][${MANAGED}]`)
    .forEach((n) => n.remove());
  for (const block of meta.jsonLd ?? []) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute(MANAGED, "");
    script.text = JSON.stringify(block);
    document.head.appendChild(script);
  }
}

interface SeoProps {
  /** Look metadata up from the central SEO map by path. */
  path?: string;
  /** Or pass explicit metadata (overrides path lookup). */
  meta?: SeoMeta;
}

export default function Seo({ path, meta }: SeoProps) {
  const resolved = meta ?? getSeo(path ?? "/");
  const signature = JSON.stringify(resolved);
  useEffect(() => {
    applySeo(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return null;
}

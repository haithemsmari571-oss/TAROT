// SSR entry used only at build time by scripts/prerender.mjs. It renders the
// marketing/content routes to static HTML so crawlers receive real content.
// Only SSR-safe pages are listed here (no data fetching / browser APIs at render
// time). Unlisted routes fall through to a 404.
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import type { ComponentType } from "react";

import MarketingShell from "./prerender/MarketingShell";
import DoesHeMissMe from "./features/seo/views/DoesHeMissMe";
import WillMyExComeBack from "./features/seo/views/WillMyExComeBack";
import NotFound from "./features/misc/views/NotFound";
import { getSeo } from "./seo/seoData";
import { renderHeadTags } from "./seo/renderHead";

// Routes we prerender. Add a page here (and to scripts/prerender.mjs ROUTES) to
// ship another static SEO page.
const PAGES: Record<string, ComponentType> = {
  "/does-he-miss-me": DoesHeMissMe,
  "/will-my-ex-come-back": WillMyExComeBack,
};

export interface RenderResult {
  head: string;
  html: string;
  statusCode: number;
}

export function render(url: string): RenderResult {
  const path = url.replace(/\/+$/, "") || "/";
  const Page = PAGES[path];
  const statusCode = Page ? 200 : 404;
  const Component = Page ?? NotFound;
  const meta = Page ? getSeo(path) : getSeo("/404");

  const html = renderToStaticMarkup(
    <StaticRouter location={url}>
      <MarketingShell>
        <Component />
      </MarketingShell>
    </StaticRouter>
  );

  return { head: renderHeadTags(meta), html, statusCode };
}

// Paths this entry can prerender (kept in sync with PAGES). The 404 shell is
// emitted separately by the prerender script.
export const PRERENDER_ROUTES = Object.keys(PAGES);

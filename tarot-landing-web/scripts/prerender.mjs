// Build-time prerenderer. After the client build (dist/) and the SSR build
// (dist-ssr/entry-server.js), this renders each marketing/content route to
// static HTML and writes it into dist/, so crawlers receive real content, title
// and meta instead of the empty SPA shell. The live client app still boots and
// takes over via createRoot on load.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distDir = join(root, "dist");
const ssrEntry = join(root, "dist-ssr", "entry-server.js");

// Extra static routes to emit as 404 pages. The 404 uses the SPA shell + the
// branded NotFound render, written to dist/404.html for nginx's error page.
const NOT_FOUND_PATH = "/__not_found__";

function injectHead(template, head) {
  // Drop the build's default <title> and description; the per-route head owns them.
  let out = template
    .replace(/\s*<title>[\s\S]*?<\/title>/i, "")
    .replace(/\s*<meta\s+name="description"[^>]*>/i, "");
  // Insert per-route head tags just before </head>.
  out = out.replace(/<\/head>/i, `    ${head}\n  </head>`);
  return out;
}

function injectBody(template, html) {
  return template.replace(
    /<div id="root"><\/div>/,
    `<div id="root">${html}</div>`
  );
}

async function writeRoute(template, render, urlPath, outFile) {
  const { head, html } = render(urlPath);
  let page = injectHead(template, head);
  page = injectBody(page, html);
  const target = join(distDir, outFile);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, page, "utf8");
  return target;
}

async function main() {
  if (!existsSync(ssrEntry)) {
    console.error(`[prerender] SSR bundle not found at ${ssrEntry}. Did the SSR build run?`);
    process.exit(1);
  }

  const template = await readFile(join(distDir, "index.html"), "utf8");
  const { render, PRERENDER_ROUTES } = await import(pathToFileURL(ssrEntry).href);

  // Map each route path to its output file inside dist/.
  const outputs = [];
  for (const routePath of PRERENDER_ROUTES) {
    const outFile = routePath === "/" ? "index.html" : `${routePath.replace(/^\//, "")}/index.html`;
    outputs.push([routePath, outFile]);
  }

  for (const [routePath, outFile] of outputs) {
    const target = await writeRoute(template, render, routePath, outFile);
    console.log(`[prerender] ${routePath.padEnd(28)} -> ${target.replace(root + "/", "").replace(/\\/g, "/")}`);
  }

  // Branded 404 page (served by nginx for unknown routes).
  const target404 = await writeRoute(template, render, NOT_FOUND_PATH, "404.html");
  console.log(`[prerender] ${"404".padEnd(28)} -> ${target404.replace(root + "/", "").replace(/\\/g, "/")}`);

  console.log(`[prerender] Done. ${outputs.length + 1} pages written.`);
}

main().catch((err) => {
  console.error("[prerender] Failed:", err);
  process.exit(1);
});

/* Icons and fonts come from the site itself, never from a third party (ROUND34 items 4 and 5).
   Run: node scripts/test-offline-icons.mts
   - vite.config.ts points "@iconify/react" at src/lib/offlineIcons.ts, which draws with the
     package's offline build (no fetching) from src/lib/offlineIcons.json;
   - every icon named in a source file the build reaches (walked from src/main.tsx and
     src/entry-server.tsx) is in that data, and the data holds nothing else except the
     footer's social logos (Footer.tsx draws ph:<platform>-logo-fill for a platform typed
     into the landing content) and the parents of aliases;
   - index.html and the source name no icon or font host, and src/styles/fonts.css serves
     Fraunces and Inter from src/assets/fonts with font-display: swap. */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(WEB, "src");
const read = (path: string) => readFileSync(path, "utf8");
let checks = 0;
const check = (ok: boolean, what: string) => { assert.ok(ok, what); checks += 1; };

// Icon sets the site draws from, and others a new icon could come from.
const ICON_SETS = ["solar", "ph", "mdi", "tabler", "eos-icons", "svg-spinners", "skill-icons", "mingcute", "line-md",
  "lucide", "ri", "heroicons", "material-symbols", "ic", "bi", "carbon", "fluent", "fa6-solid", "fa6-brands", "fa6-regular",
  "logos", "simple-icons", "iconoir", "octicon", "uil", "radix-icons", "game-icons", "twemoji", "noto", "akar-icons"];
const ICON_NAME = new RegExp(`["'\`]((?:${ICON_SETS.join("|")}):[a-z0-9]+(?:-[a-z0-9]+)*)["'\`]`, "g");
// Named in the source but not on Iconify at all: they drew nothing before and draw nothing now.
const NOT_ON_ICONIFY = ["ph:stars-duotone", "solar:cake-bold-duotone", "solar:load-minimalistic-bold-duotone",
  "solar:spinner-bold-duotone", "solar:text-cross-broken-bold-duotone"];
// Platforms the footer's social links draw a logo for (Footer.tsx, ph:<platform>-logo-fill).
const FOOTER_PLATFORMS = ["instagram", "tiktok", "youtube", "facebook", "x", "twitter", "threads", "pinterest", "linkedin",
  "snapchat", "whatsapp", "telegram", "discord", "spotify", "soundcloud", "apple-podcasts", "reddit", "twitch", "tumblr",
  "medium", "patreon", "messenger", "mastodon", "linktree"];

// ── the source files the build reaches ──
const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const resolveImport = (from: string, spec: string) => {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, `index${e}`))]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};
const reached = new Set<string>();
const queue = [join(SRC, "main.tsx"), join(SRC, "entry-server.tsx")];
while (queue.length) {
  const file = queue.pop()!;
  if (reached.has(file)) continue;
  reached.add(file);
  if (!/\.(tsx?|jsx?|mjs)$/.test(file)) continue;
  for (const m of read(file).matchAll(/(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g)) {
    const found = resolveImport(file, m[1] ?? m[2] ?? m[3]);
    if (found) queue.push(found);
  }
}
check(reached.has(join(SRC, "features", "client-app", "ClientAppShell.tsx")) && reached.has(join(SRC, "layouts", "Footer.tsx")), "the walk reaches the app and the website");
const used = new Map<string, string>();
for (const file of reached) {
  if (!/\.(tsx?|jsx?)$/.test(file)) continue;
  for (const m of read(file).matchAll(ICON_NAME)) if (!used.has(m[1])) used.set(m[1], relative(SRC, file).split(sep).join("/"));
}

// ── the bundled data ──
type IconSet = { prefix: string; icons: Record<string, { body: string }>; aliases?: Record<string, { parent: string }> };
const sets = JSON.parse(read(join(SRC, "lib", "offlineIcons.json"))) as IconSet[];
const has = (full: string) => {
  const [prefix, name] = full.split(":");
  const set = sets.find((s) => s.prefix === prefix);
  return Boolean(set && (set.icons[name] || set.aliases?.[name]));
};
for (const [name, file] of used) {
  if (NOT_ON_ICONIFY.includes(name)) { check(!has(name), `${name} is not on Iconify`); continue; }
  check(has(name), `${name} (named in src/${file}) is in src/lib/offlineIcons.json`);
}
for (const platform of FOOTER_PLATFORMS) check(has(`ph:${platform}-logo-fill`), `the footer can draw ${platform}`);
check(new Set(sets.map((s) => s.prefix)).size === sets.length, "one entry per icon set");
for (const set of sets) {
  for (const [name, icon] of Object.entries(set.icons)) check(typeof icon.body === "string" && icon.body.length > 0, `${set.prefix}:${name} has a body`);
  for (const [name, alias] of Object.entries(set.aliases ?? {})) check(Boolean(set.icons[alias.parent]), `${set.prefix}:${name}'s parent is there`);
}
// Nothing the site does not draw (the data rides in the first load).
const parents = new Set(sets.flatMap((s) => Object.values(s.aliases ?? {}).map((a) => `${s.prefix}:${a.parent}`)));
const social = new Set(FOOTER_PLATFORMS.map((p) => `ph:${p}-logo-fill`));
for (const set of sets) for (const name of [...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})]) {
  const full = `${set.prefix}:${name}`;
  check(used.has(full) || parents.has(full) || social.has(full), `${full} is drawn by the site`);
}

// ── the package's offline build, through one module ──
const iconsModule = read(join(SRC, "lib", "offlineIcons.ts"));
check(/from "@iconify\/react\/offline"/.test(iconsModule) && /addCollection\(/.test(iconsModule) && /from "\.\/offlineIcons\.json"/.test(iconsModule), "offlineIcons.ts registers the data with the offline build");
const viteConfig = read(join(WEB, "vite.config.ts"));
check(/find: \/\^@iconify\\\/react\$\/, replacement: fileURLToPath\(new URL\("\.\/src\/lib\/offlineIcons\.ts", import\.meta\.url\)\)/.test(viteConfig), "vite.config.ts points @iconify/react at offlineIcons.ts");
// A host named in a comment fetches nothing (offlineIcons.ts and fonts.css say where the
// data came from); one named in code or markup would.
const HOSTS = /api\.iconify\.design|api\.simplesvg\.com|api\.unisvg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/;
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "");
const sourceFiles: string[] = [];
(function walk(dir: string) { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(tsx?|jsx?|css|html)$/.test(e.name)) sourceFiles.push(p); } })(SRC);
for (const file of sourceFiles) {
  const text = read(file);
  const rel = relative(SRC, file).split(sep).join("/");
  if (rel !== "lib/offlineIcons.ts") check(!/@iconify\/react\//.test(text), `src/${rel} imports the icon package only as "@iconify/react"`);
  check(!HOSTS.test(withoutComments(text)), `src/${rel} names no icon or font host`);
}
const indexHtml = read(join(WEB, "index.html"));
check(!HOSTS.test(indexHtml), "index.html names no icon or font host, not even in a comment");
check(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/.test(indexHtml) && existsSync(join(WEB, "public", "favicon.svg")), "the favicon is the site's own file");

// ── the fonts ──
const fontsCss = read(join(SRC, "styles", "fonts.css"));
const faces = [...fontsCss.matchAll(/@font-face \{([^}]+)\}/g)].map((m) => m[1]);
check(faces.length === 43, "Google's 43 faces, block for block");
for (const face of faces) {
  const url = face.match(/src: url\(([^)]+)\) format\('woff2'\);/)?.[1] ?? "";
  check(/font-display: swap;/.test(face), "every face swaps");
  check(url.startsWith("../assets/fonts/") && existsSync(resolve(join(SRC, "styles"), url)), `${url} is the site's own file`);
}
const families = new Set(faces.map((f) => `${f.match(/font-family: '([^']+)'/)?.[1]} ${f.match(/font-style: (\w+)/)?.[1]} ${f.match(/font-weight: (\d+)/)?.[1]}`));
check(["Fraunces normal 300", "Fraunces normal 400", "Fraunces normal 500", "Fraunces italic 300", "Fraunces italic 400",
  "Inter normal 400", "Inter normal 500", "Inter normal 600", "Inter normal 700"].every((f) => families.has(f)) && families.size === 9, "the same faces and weights");
check(/import '\.\/styles\/fonts\.css'/.test(read(join(SRC, "main.tsx"))), "main.tsx loads the fonts");

console.log(`icons and fonts from the site itself: ${checks} checks passed (${used.size} icon names in ${reached.size} reached files)`);

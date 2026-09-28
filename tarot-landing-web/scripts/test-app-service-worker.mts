/* The installed app's service worker as a build writes it (ROUND31, B2;
   src/features/client-app/offline/sw.js, filled by vite.config.ts).
   Run after a build: node scripts/test-app-service-worker.mts [path/to/sw.js]
   (default dist/sw.js). The worker runs in a sandbox with a fake network and
   a fake Cache Storage, so every rule is checked on the real built file. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const file = process.argv[2] ?? "dist/sw.js";
const source = fs.readFileSync(file, "utf8");
assert.doesNotMatch(source, /__RELEASE__|__APP_SHELL__/, "the build filled the template");

const ORIGIN = "https://askvalentina.co.uk";

type Stored = Map<string, Response>;
const storage = new Map<string, Stored>();
const cacheFor = (stored: Stored) => ({
  addAll: async (urls: string[]) => {
    for (const url of urls) stored.set(new URL(url, ORIGIN).href, await network(new Request(new URL(url, ORIGIN))));
  },
  match: async (request: { url: string }) => stored.get(request.url)?.clone(),
  put: async (request: { url: string }, response: Response) => { stored.set(request.url, response); },
});
const caches = {
  open: async (name: string) => {
    if (!storage.has(name)) storage.set(name, new Map());
    return cacheFor(storage.get(name)!);
  },
  keys: async () => [...storage.keys()],
  delete: async (name: string) => storage.delete(name),
};

let online = true;
const fetched: string[] = [];
async function network(request: { url: string }): Promise<Response> {
  fetched.push(request.url);
  if (!online) throw new TypeError("Failed to fetch");
  const status = request.url.includes("/missing") ? 404 : 200;
  return new Response(`body of ${request.url}`, { status });
}

const listeners: Record<string, (event: unknown) => void> = {};
const self = {
  location: new URL(`${ORIGIN}/sw.js`),
  addEventListener: (type: string, listener: (event: unknown) => void) => { listeners[type] = listener; },
  skipWaiting: async () => {},
  clients: { claim: async () => {} },
};
vm.runInNewContext(source, { self, caches, fetch: network, Response, URL, Promise, console });
const quiet = () => ({ self: { ...self, addEventListener() {} }, caches, fetch: network, Response, URL, Promise, console });
// Array.from: an array made in the sandbox has the sandbox's prototype.
const shell: string[] = Array.from(vm.runInNewContext(`${source}\nAPP_SHELL`, quiet()));
const release: string = vm.runInNewContext(`${source}\nCACHE`, quiet());

async function lifecycle(type: string) {
  let done: Promise<unknown> = Promise.resolve();
  listeners[type]({ waitUntil: (p: Promise<unknown>) => { done = p; } });
  await done;
}

/* One fetch through the worker: undefined when it lets the browser handle the
   request, otherwise the worker's answer. */
async function through(url: string, init: { method?: string; mode?: string; range?: boolean } = {}) {
  let answer: Promise<Response> | undefined;
  const headers = new Headers(init.range ? { range: "bytes=0-" } : {});
  listeners.fetch({
    request: { url, method: init.method ?? "GET", mode: init.mode ?? "cors", headers },
    respondWith: (p: Promise<Response>) => { answer = p; },
  });
  return answer && (await answer);
}

// ── install keeps the app shell in this release's cache, and nothing else ──
storage.set("av-app-an-older-release", new Map([["x", new Response("old")]]));
storage.set("someone-elses-cache", new Map());
assert.ok(shell.length > 0 && shell.every((path) => path.startsWith("/assets/")), "the app shell is build files");
await lifecycle("install");
assert.deepEqual([...storage.get(release)!.keys()].sort(), shell.map((p) => new URL(p, ORIGIN).href).sort());

// ── activate deletes every older release's cache and only those ──
await lifecycle("activate");
assert.deepEqual([...storage.keys()].sort(), [release, "someone-elses-cache"].sort());

// ── never answered by the worker: the API, the CRM, other sites, writes ──
fetched.length = 0;
for (const url of [
  `${ORIGIN}/api/chat/inbox`, `${ORIGIN}/api`, `${ORIGIN}/api/auth/verify-account/abc`,
  `${ORIGIN}/crm/`, `${ORIGIN}/crm`, `${ORIGIN}/crm/#/control`,
  "https://api.iconify.design/ph:eye.svg", "https://fonts.googleapis.com/css2?family=Inter",
]) {
  assert.equal(await through(url), undefined, url);
  assert.equal(await through(url, { mode: "navigate" }), undefined, `${url} (a page)`);
}
assert.equal(await through(`${ORIGIN}/assets/app.js`, { method: "POST" }), undefined, "a write");
assert.equal(await through(`${ORIGIN}/assets/song.mp3`, { range: true }), undefined, "a media range");
assert.equal(await through(`${ORIGIN}/icons/icon-192.png`), undefined, "a file outside the build");
assert.deepEqual(fetched, [], "the worker itself fetched none of them");

// ── a build file: fetched once, then answered from the cache ──
const chunk = `${ORIGIN}/assets/ClientShortsScreen-abc123.js`;
assert.equal(await (await through(chunk))!.text(), `body of ${chunk}`);
assert.ok(storage.get(release)!.has(chunk), "kept after the first fetch");
online = false;
assert.equal(await (await through(chunk))!.text(), `body of ${chunk}`, "answered offline from the cache");
online = true;
assert.equal((await through(`${ORIGIN}/assets/missing.js`))!.status, 404);
assert.ok(!storage.get(release)!.has(`${ORIGIN}/assets/missing.js`), "a failed answer is not kept");

// ── a page: always the network; with no network, the offline screen ──
const page = await through(`${ORIGIN}/app/home`, { mode: "navigate" });
assert.equal(await page!.text(), `body of ${ORIGIN}/app/home`);
assert.ok(![...storage.values()].some((stored) => stored.has(`${ORIGIN}/app/home`)), "a page is never kept");
online = false;
const offline = await through(`${ORIGIN}/app/chats/5?topup=1`, { mode: "navigate" });
const html = await offline!.text();
assert.match(offline!.headers.get("content-type") ?? "", /text\/html/);
assert.equal(offline!.headers.get("cache-control"), "no-store");
assert.ok(html.includes("<p>You're offline. Check your connection and try again.</p>"));
assert.ok(html.includes('<button type="button" onclick="location.reload()">Try again</button>'));
assert.doesNotMatch(html, /https?:\/\//, "the offline screen loads nothing");

console.log(`app service worker (${release}, ${shell.length} app shell files): all checks passed`);

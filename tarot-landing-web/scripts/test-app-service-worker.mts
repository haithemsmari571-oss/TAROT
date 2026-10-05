/* The installed app's service worker as a build writes it (ROUND31, B2;
   src/features/client-app/offline/sw.js, filled by vite.config.ts).
   Run after a build: node scripts/test-app-service-worker.mts [path/to/sw.js]
   (default dist/sw.js). The worker runs in a sandbox with a fake network and
   a fake Cache Storage, so every rule is checked on the real built file.
   Since ROUND57 also its phone notifications: what a push shows and when it
   shows nothing, and where a tap lands, under /app/ and under /owner/. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const file = process.argv[2] ?? "dist/sw.js";
const source = fs.readFileSync(file, "utf8");
assert.doesNotMatch(source, /__RELEASE__|__APP_SHELL__|__APP_SCOPE__|__OPEN_FROM_NOTIFICATION__|__BRAND_NAME__/, "the build filled the template");

const ORIGIN = "https://askvalentina.co.uk";
// The page side's own words (ROUND57), read from their one source.
const sourceOf = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const OPEN_WORD = /OPEN_FROM_NOTIFICATION = "([^"]+)"/.exec(sourceOf("src/features/client-app/offline/appServiceWorker.ts"))![1];
const BRAND = /BRAND_NAME = "([^"]+)"/.exec(sourceOf("src/lib/company.ts"))![1];

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
  registration: { scope: `${ORIGIN}/app/` },
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
online = true;

// ══ Phone notifications (ROUND57): the same file under /app/ and /owner/ ══
interface FakeWindow {
  url: string;
  focused: boolean;
  visibilityState: "visible" | "hidden";
  focusCalls: number;
  posted: unknown[];
  focus(): Promise<FakeWindow>;
  postMessage(message: unknown): void;
}
function pageAt(path: string, inSight = false): FakeWindow {
  const page: FakeWindow = {
    url: `${ORIGIN}${path}`,
    focused: inSight,
    visibilityState: inSight ? "visible" : "hidden",
    focusCalls: 0,
    posted: [],
    focus: async () => { page.focusCalls += 1; return page; },
    postMessage: (message) => { page.posted.push(JSON.parse(JSON.stringify(message))); },
  };
  return page;
}

/* A fresh worker registered for `scopePath`, with fake windows, a fake
   notification tray and a fake new-window opener. */
function workerFor(scopePath: string) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  let windows: FakeWindow[] = [];
  const sandboxSelf = {
    location: new URL(`${ORIGIN}/sw.js`),
    registration: {
      scope: `${ORIGIN}${scopePath}`,
      showNotification: async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options: JSON.parse(JSON.stringify(options)) });
      },
    },
    addEventListener: (type: string, listener: (event: unknown) => void) => { handlers[type] = listener; },
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      matchAll: async (options: unknown) => {
        assert.deepEqual(JSON.parse(JSON.stringify(options)), { type: "window", includeUncontrolled: true });
        return windows;
      },
      openWindow: async (url: string) => { opened.push(url); return null; },
    },
  };
  vm.runInNewContext(source, { self: sandboxSelf, caches, fetch: network, Response, URL, Promise, console });
  const dispatch = async (type: string, event: object) => {
    let done: Promise<unknown> = Promise.resolve();
    handlers[type]({ ...event, waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
  };
  return {
    handlers, shown, opened,
    windowsAre: (list: FakeWindow[]) => { windows = list; },
    push: (payload: unknown) => dispatch("push", {
      data: payload === undefined ? null : { json: () => (typeof payload === "string" ? JSON.parse(payload) : payload) },
    }),
    click: async (url: string | undefined) => {
      let closed = false;
      await dispatch("notificationclick", { notification: { data: { url }, close: () => { closed = true; } } });
      return closed;
    },
  };
}

// ── /app/: a reply's notification ──
const reply = { title: "Amrit replied ✦", body: "Tap to read her message", url: "/app/chats/53", tag: "chat-53" };
const app = workerFor("/app/");
await app.push(reply);
assert.deepEqual(app.shown, [{
  title: "Amrit replied ✦",
  options: { body: "Tap to read her message", tag: "chat-53", icon: "/icons/icon-192.png", data: { url: "/app/chats/53" } },
}], "shown with the app's icon and the chat to open");

// ...not while that very chat is open in front of her
app.shown.length = 0;
app.windowsAre([pageAt("/app/chats/53", true)]);
await app.push(reply);
assert.deepEqual(app.shown, [], "nothing shown over the open chat");
// ...but yes when it is open out of sight, or another chat is in front
app.windowsAre([pageAt("/app/chats/53", false), pageAt("/app/chats/52", true)]);
await app.push(reply);
assert.equal(app.shown.length, 1, "shown when that chat is not in sight");
// a push with nothing readable still shows something, under the brand
app.shown.length = 0;
app.windowsAre([]);
await app.push(undefined);
await app.push("{not json");
assert.deepEqual(app.shown.map((n) => [n.title, n.options.body]), [[BRAND, ""], [BRAND, ""]]);

// ── /app/: a tap ──
// the chat already open somewhere comes to the front
let there = pageAt("/app/chats/53");
app.windowsAre([pageAt("/app/home"), there]);
assert.equal(await app.click("/app/chats/53"), true, "the notification closes");
assert.equal(there.focusCalls, 1);
assert.deepEqual(app.opened, []);
// another page of the app comes to the front and moves itself to the chat
const home = pageAt("/app/home");
app.windowsAre([pageAt("/login"), home]);
await app.click("/app/chats/53");
assert.equal(home.focusCalls, 1);
assert.deepEqual(home.posted, [{ type: OPEN_WORD, url: "/app/chats/53" }]);
assert.deepEqual(app.opened, [], "a page outside the app is never used");
// ...and moves even when the browser will not bring it to the front
const unfocusable = pageAt("/app/readers");
unfocusable.focus = async () => { throw new TypeError("not allowed to focus"); };
app.windowsAre([unfocusable]);
await app.click("/app/chats/53");
assert.deepEqual(unfocusable.posted, [{ type: OPEN_WORD, url: "/app/chats/53" }]);
// no page of the app open: a new window on the chat
app.windowsAre([pageAt("/login"), pageAt("/owner/messages")]);
await app.click("/app/chats/53");
assert.deepEqual(app.opened, ["/app/chats/53"]);
// an address outside the app, or another site, opens the app's own start
app.opened.length = 0;
app.windowsAre([]);
await app.click("/owner/messages/53");
await app.click("https://elsewhere.example/app/chats/1");
await app.click(undefined);
assert.deepEqual(app.opened, ["/app/", "/app/", "/app/"]);

// ── /owner/: alerts only, nothing kept, nothing answered ──
const owner = workerFor("/owner/");
const cachesBefore = JSON.stringify([...storage.keys()].sort());
await (async () => {
  let done: Promise<unknown> = Promise.resolve();
  owner.handlers.install({ waitUntil: (p: Promise<unknown>) => { done = p; } });
  await done;
  owner.handlers.activate({ waitUntil: (p: Promise<unknown>) => { done = p; } });
  await done;
})();
assert.equal(JSON.stringify([...storage.keys()].sort()), cachesBefore, "the owner's worker keeps and deletes nothing");
for (const [url, mode] of [[`${ORIGIN}/owner/messages`, "navigate"], [`${ORIGIN}/assets/main-abc.js`, "cors"]]) {
  let answered = false;
  owner.handlers.fetch({ request: { url, method: "GET", mode, headers: new Headers() }, respondWith: () => { answered = true; } });
  assert.equal(answered, false, `${url} goes to the network as if there were no worker`);
}
await owner.push({ title: "New message for Amrit", body: "From User", url: "/owner/messages/53", tag: "owner-chat-53" });
assert.deepEqual(owner.shown, [{
  title: "New message for Amrit",
  options: { body: "From User", tag: "owner-chat-53", icon: "/icons/owner-192.png", data: { url: "/owner/messages/53" } },
}], "shown with the owner's icon");
// /owner itself (outside the /owner/ scope) is the owner's page and moves itself
const ownerHome = pageAt("/owner");
owner.windowsAre([pageAt("/app/chats/53"), ownerHome]);
await owner.click("/owner/messages/53");
assert.equal(ownerHome.focusCalls, 1);
assert.deepEqual(ownerHome.posted, [{ type: OPEN_WORD, url: "/owner/messages/53" }]);
owner.windowsAre([pageAt("/app/home")]);
await owner.click("/owner/messages/53");
assert.deepEqual(owner.opened, ["/owner/messages/53"], "an app page is never the owner's");
there = pageAt("/owner/messages/53");
owner.windowsAre([there]);
await owner.click("/owner/messages/53");
assert.equal(there.focusCalls, 1);

console.log(`app service worker (${release}, ${shell.length} app shell files): all checks passed, with push under /app/ and /owner/`);

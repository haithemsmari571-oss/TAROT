/**
 * PER-MESSAGE EVIDENCE (step 5a). Drives the REAL app (Vite dev server, this
 * checkout) at 390 px with every HTTP call and both WebSockets answered by
 * Playwright route interception, because the full stack is not run here. What
 * the screenshots prove is the app's own code paths on the payload shapes the
 * backend sends; nothing in the app is stubbed.
 *
 *   hall-per-message.png             the hall with a per-message reader (rate line)
 *   hall-per-message-lobby.png       the wait, with the "first message" card
 *   room-per-message.png             the room mid-reading: header line, price on
 *                                    the send button, the counter
 *   room-per-message-rejected.png    message_rejected READER_UNAVAILABLE: the
 *                                    line under the composer, the text kept
 *   room-per-message-out-of-balance.png  balance below the price: composer
 *                                    disabled, "Add Stardust to keep going",
 *                                    the offering panel open
 *   room-per-minute-control.png      BILLING_MODE per_minute: meter and Reflect
 *                                    exactly as today
 *
 * Step 5b adds:
 *   admin-practitioners-per-message-column.png  the list with its "Per message" column
 *   admin-practitioner-modal-per-message.png    the modal's field, refusing 0
 *   admin-my-profile-per-message.png            the reader profile's field, prefilled
 *   (the old admin screens have no route any more — src/App.tsx sends every
 *    /admin/* URL to the CRM — so scripts/harness/admin.html mounts them)
 *   hall-per-message-draft-restored.png         the question back in the form after
 *                                               ?topup=1&status=success
 *   browse-per-message.png / -filtered.png      per-message prices, the filter on them
 *   details-per-message.png                     the reader's page pricing a message
 *   browse-per-minute-control.png               per_minute browse, exactly as today
 *
 * Playwright comes from the CRM's node_modules, as every verify script here does.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(
  process.env.PW_HOST || "C:/Users/Haithem/Desktop/LAMMA/secondbrain/crm/package.json"
);
const { chromium } = require("playwright");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, "evidence", "per-message");
const PORT = Number(process.env.EVIDENCE_PORT || 5181);
const APP = `http://127.0.0.1:${PORT}`;
const API = "http://127.0.0.1:8000"; // never reached: every call is intercepted

const CLIENT = { id: 100, username: "khw", email: "khw@example.test", role: "USER" };
const READER = {
  id: 7, username: "Sophie", email: "sophie@example.test",
  price_per_second: null, price_per_message: 2, bio: "Love, loss and what comes next.",
  is_verified: true, is_online: true, profile_picture_url: "", categories: [{ id: 1, title: "Love" }],
  availability: [],
};
const NOW = "2026-09-12T18:00:00+00:00";
const ADMIN = { id: 1, username: "admin", email: "admin@example.test", role: "ADMIN" };
const PSYCHIC_USER = { id: 7, username: "Sophie", email: "sophie@example.test", role: "PSYCHIC" };
// a reader with no per-message price: no price line under per_message
const READER_NO_MESSAGE_PRICE = { ...READER, id: 8, username: "Marta", email: "marta@example.test", price_per_second: 0.05, price_per_message: null, categories: [{ id: 2, title: "Career" }] };
// the same reader as today's production shape, for the per-minute control
const READER_PER_MINUTE = { ...READER, price_per_second: 0.05, price_per_message: null };

// a JWT the client accepts: only the exp claim is read, never the signature
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const TOKEN = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub: "100", exp: 4102444800 })}.sig`;

const CHAT = { id: 1, status: "ACTIVE", user_name: "Sophie", user_profile_pic_url: "", last_message: "will he come back? we broke up in march", psychic_id: 7, updated_at: NOW };
const MESSAGES = [
  { id: 10, chat_id: 1, sender_id: 100, content: "will he come back? we broke up in march", created_at: NOW, is_system: false, status: "READ" },
  { id: 11, chat_id: 1, sender_id: 7, content: "u started timing the replies. u wouldn't admit it but u know exactly how long it takes", created_at: NOW, is_system: false, status: "READ" },
  { id: 12, chat_id: 1, sender_id: 7, content: "fast and u breathe. slow and ur body braces", created_at: NOW, is_system: false, status: "READ" },
];

function perMessageSession(balance) {
  return {
    elapsed_seconds: null, estimated_cost: null, price_per_second: null, rate_per_minute: 0,
    client_balance: balance, credit_balance: 0, paid_balance: balance,
    remaining_seconds: null, remaining_minutes: null, minutes_charged: null,
    session_status: "ACTIVE", grace_seconds_left: 0, is_topping_up: false,
    reflect_remaining_seconds: 0, reflect_seconds_used: 0, reflecting_since: null,
    billing_mode: "per_message", price_per_message: 2, balance,
  };
}
const PER_MINUTE_SESSION = {
  elapsed_seconds: 372, estimated_cost: 2.4, price_per_second: 1 / 60, rate_per_minute: 1,
  client_balance: 25, credit_balance: 0, paid_balance: 25,
  remaining_seconds: 840, remaining_minutes: 14, minutes_charged: 7,
  session_status: "ACTIVE", grace_seconds_left: 0, is_topping_up: false,
  reflect_remaining_seconds: 240, reflect_seconds_used: 0, reflecting_since: null,
  billing_mode: "per_minute", price_per_message: null, balance: 25,
};

async function waitForServer(url, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`dev server not up at ${url}`);
}

function startVite() {
  const bin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(process.execPath, [bin, "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: ROOT, env: { ...process.env, VITE_API_URL: API }, stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => process.env.EVIDENCE_VERBOSE && process.stdout.write(d));
  child.stderr.on("data", (d) => process.stderr.write(d));
  return child;
}

/** Answer every API call the page makes with the scenario's data. */
async function mockHttp(page, s) {
  await page.route(`${API}/api/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace(/^\/api/, "");
    const m = req.method();
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (p === "/billing-mode") return json({ billing_mode: s.mode });
    if (p === "/profile/me") return json(s.user ?? CLIENT);
    if (p === "/psychic/" || p === "/psychic") { const items = s.readers ?? [READER]; return json({ items, total: items.length, skip: 0, limit: 100 }); }
    if (p === "/category/" || p === "/category") return json([{ id: 1, title: "Love" }, { id: 2, title: "Career" }]);
    if (p === "/reviews/psychic/7/summary") return json({ psychic_id: 7, total_reviews: 12, average_rating: 4.8, rating_distribution: {} });
    if (p.startsWith("/reviews")) return json([]);
    if (p === "/chat/" || p === "/chat") return json([CHAT]);
    if (p === "/chat/my-chats") return json([{ ...CHAT, user_id: 100, psychic_username: "Sophie", client_joined_at: NOW }]);
    if (p === "/chat/1/messages") return json({ messages: MESSAGES, total: MESSAGES.length, offset: 0, limit: 10 });
    if (p === "/chat/1/session-time") return json(s.session);
    if (p === "/chat/1/details") return json({ id: 1, status: "ACTIVE", response_mode: "SABRI", user_id: 100, psychic_id: 7, created_at: NOW, updated_at: NOW, psychic: { id: 7, username: "Sophie", email: READER.email, price_per_second: null, price_per_message: 2 }, client: { id: 100, username: "khw", email: CLIENT.email }, billing_mode: s.mode, price_per_message: 2, balance: s.session.balance });
    if (p === "/psychic/7") return json(READER);
    if (p === "/chat/request" && m === "POST") return s.request ? json(s.request.body, s.request.status) : json(null, 201);
    if (p === "/transactions/me/balance") return json({ balance: s.session.balance, credit_balance: 0, paid_balance: s.session.balance });
    if (p === "/payment/unit-price") return json({ unit_price_cents: 100 });
    if (p === "/payment/stardust-tiers") return json({ min_usd: 15, max_usd: 1000, lifetime_copy: "", bands: [] });
    if (p === "/payment/create-stardust-checkout-session" && m === "POST") return json({ url: `${APP}/chats?chat_id=1&per_message=1&status=success` });
    if (p.startsWith("/hall-sounds")) return json([]);
    if (p.startsWith("/notifications")) return json([]);
    return json(m === "GET" ? {} : null, m === "GET" ? 200 : 201);
  });
}

/** Both sockets, answered here. The chat socket sends session_info after auth
    and answers a client message the way the scenario says. */
async function mockSockets(page, s) {
  await page.routeWebSocket((url) => url.pathname === "/api/notifications/ws", (ws) => {
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "auth") ws.send(JSON.stringify({ type: "auth_success" }));
    });
  });
  await page.routeWebSocket((url) => url.pathname.startsWith("/api/chat/ws/"), (ws) => {
    let nextId = 100;
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "auth") {
        ws.send(JSON.stringify({ type: "auth_success" }));
        ws.send(JSON.stringify({ event: "session_info", data: {
          chat_id: 1, elapsed_seconds: s.session.elapsed_seconds, estimated_cost: s.session.estimated_cost,
          remaining_seconds: s.session.remaining_seconds, client_balance: s.session.client_balance,
          chat_status: "ACTIVE", session_status: "ACTIVE", started_at: NOW, rate_per_second: s.session.price_per_second,
          reflect_remaining_seconds: s.session.reflect_remaining_seconds, reflect_seconds_used: 0, reflecting_since: null,
          billing_mode: s.session.billing_mode, price_per_message: s.session.price_per_message, balance: s.session.balance,
        } }));
        return;
      }
      if (m.type === "message") {
        if (s.reject) {
          ws.send(JSON.stringify({ event: "message_rejected", data: s.reject }));
          return;
        }
        const id = nextId++;
        ws.send(JSON.stringify({ type: "message", id, content: m.content, sender_id: 100, user_id: 100, chat_id: 1, timestamp: NOW, created_at: NOW, status: "READ" }));
        ws.send(JSON.stringify({ event: "message_fee_charged", data: { message_id: id, fee: 2, client_balance: s.session.balance - 2 } }));
      }
    });
  });
}

async function openPage(browser, s) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("refresh_token", token);
    localStorage.setItem("auth_user", JSON.stringify(user));
  }, { token: TOKEN, user: s.user ?? CLIENT });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await mockSockets(page, s);
  await mockHttp(page, s);
  return { context, page };
}

async function shoot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log("  wrote", path.relative(ROOT, file));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const vite = startVite();
  try {
    await waitForServer(`${APP}/`);
    const browser = await chromium.launch();
    try {
      // 1. the hall with a per-message reader, then the wait
      {
        const { context, page } = await openPage(browser, { mode: "per_message", session: perMessageSession(18) });
        await page.goto(`${APP}/reading/new/7`, { waitUntil: "networkidle" });
        await page.waitForSelector("#hall-rate", { timeout: 15000 });
        console.log("  hall rate line:", (await page.textContent("#hall-rate"))?.trim());
        await page.waitForTimeout(1200);
        await shoot(page, "hall-per-message.png");
        await page.fill("#q", "will he come back? we broke up in march");
        await page.click("#begin");
        await page.waitForTimeout(4200);
        const cards = await page.$$eval("#cards .card", (els) => els.map((e) => e.textContent?.trim()));
        console.log("  lobby cards:", JSON.stringify(cards));
        await shoot(page, "hall-per-message-lobby.png");
        await context.close();
      }
      // 2. the room mid-reading, then a refused message
      {
        const { context, page } = await openPage(browser, {
          mode: "per_message", session: perMessageSession(18),
          reject: { reason: "READER_UNAVAILABLE", message: "This reader is not available right now." },
        });
        await page.goto(`${APP}/chats?chat_id=1`, { waitUntil: "networkidle" });
        await page.waitForSelector("#permsg-line", { timeout: 15000 });
        await page.waitForSelector("#roominput:not([disabled])", { timeout: 15000 });
        await page.fill("#roominput", "and what about the job, is it the same thing");
        await page.waitForTimeout(600);
        console.log("  header:", (await page.textContent("#permsg-line"))?.trim());
        console.log("  send:", (await page.textContent("#send"))?.trim(), "| counter:", (await page.textContent("#roomcount"))?.trim());
        await shoot(page, "room-per-message.png");
        await page.click("#send");
        await page.waitForSelector("#permsg-note", { timeout: 10000 });
        console.log("  rejected:", (await page.textContent("#permsg-note"))?.trim(), "| input kept:", JSON.stringify(await page.inputValue("#roominput")));
        await shoot(page, "room-per-message-rejected.png");
        await context.close();
      }
      // 3. out of balance: composer disabled, the line, the offering panel open
      {
        const { context, page } = await openPage(browser, { mode: "per_message", session: perMessageSession(1) });
        await page.goto(`${APP}/chats?chat_id=1`, { waitUntil: "networkidle" });
        await page.waitForSelector("#permsg-note", { timeout: 15000 });
        await page.waitForTimeout(1500);
        console.log("  out of balance:", (await page.textContent("#permsg-note"))?.trim(), "| composer disabled:", await page.$eval("#roominput", (e) => e.disabled), "| glider open:", !!(await page.$("text=Secure Stripe checkout")));
        await shoot(page, "room-per-message-out-of-balance.png");
        await context.close();
      }
      // 4. the per-minute control: meter and Reflect, exactly as today
      {
        const { context, page } = await openPage(browser, { mode: "per_minute", session: PER_MINUTE_SESSION });
        await page.goto(`${APP}/chats?chat_id=1`, { waitUntil: "networkidle" });
        await page.waitForSelector("#spent", { timeout: 15000 });
        await page.waitForSelector("#reflect", { timeout: 15000 });
        await page.waitForTimeout(1200);
        console.log("  per-minute meter:", (await page.textContent("#spent"))?.trim(), (await page.textContent("#elapsed"))?.trim(), (await page.textContent("#mins"))?.trim(), "| reflect:", !!(await page.$("#reflect")), "| send:", (await page.textContent("#send"))?.trim(), "| permsg line:", !!(await page.$("#permsg-line")));
        await shoot(page, "room-per-minute-control.png");
        await context.close();
      }
      // ── step 5b ──
      // 5. the practitioners list: the "Per message" column
      {
        const { context, page } = await openPage(browser, { mode: "per_message", session: perMessageSession(18), user: ADMIN, readers: [READER, READER_NO_MESSAGE_PRICE] });
        await page.goto(`${APP}/scripts/harness/admin.html?screen=practitioners`, { waitUntil: "networkidle" });
        await page.waitForSelector("th:has-text('Per message')", { timeout: 20000 });
        await page.waitForSelector("td:has-text('£2.00')", { timeout: 20000 });
        const headers = await page.$$eval("thead th", (els) => els.map((e) => e.textContent?.trim()));
        const rows = await page.$$eval("tbody tr", (trs) => trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent?.trim())));
        console.log("  practitioners headers:", JSON.stringify(headers));
        console.log("  practitioners rows:", JSON.stringify(rows));
        await page.$eval("th:has-text('Per message')", (e) => e.scrollIntoView({ inline: "center", block: "center" }));
        await page.waitForTimeout(800);
        await shoot(page, "admin-practitioners-per-message-column.png");
        // the same table at desktop width, where every column is legible
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(800);
        await shoot(page, "admin-practitioners-per-message-column-desktop.png");
        await context.close();
      }
      // 6. the practitioner modal: the field, its validation, then a valid value
      {
        const { context, page } = await openPage(browser, { mode: "per_message", session: perMessageSession(18), user: ADMIN, readers: [READER, READER_NO_MESSAGE_PRICE] });
        await page.goto(`${APP}/scripts/harness/admin.html?screen=practitioners`, { waitUntil: "networkidle" });
        await page.waitForSelector("text=Add Psychic", { timeout: 20000 });
        await page.click("text=Add Psychic");
        const field = 'input[aria-label="Price per message (£)"]';
        await page.waitForSelector(field, { timeout: 10000 });
        await page.fill(field, "0");
        await page.waitForSelector("text=Must be more than 0", { timeout: 5000 });
        await page.$eval(field, (e) => e.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(800);
        console.log("  modal field value:", JSON.stringify(await page.inputValue(field)), "| step:", await page.getAttribute(field, "step"), "| min:", await page.getAttribute(field, "min"), "| error shown:", !!(await page.$("text=Must be more than 0")));
        await shoot(page, "admin-practitioner-modal-per-message.png");
        await page.fill(field, "2.5");
        await page.waitForTimeout(300);
        console.log("  modal after 2.5 — error shown:", !!(await page.$("text=Must be more than 0")));
        await context.close();
      }
      // 6b. the reader profile: the field prefilled from price_per_message
      {
        const { context, page } = await openPage(browser, { mode: "per_message", session: perMessageSession(18), user: PSYCHIC_USER });
        await page.goto(`${APP}/scripts/harness/admin.html?screen=my-profile`, { waitUntil: "networkidle" });
        const field = 'input[aria-label="Price per message (£)"]';
        await page.waitForSelector(field, { timeout: 20000 });
        await page.waitForFunction((sel) => (document.querySelector(sel) || {}).value === "2", field, { timeout: 15000 });
        await page.$eval(field, (e) => e.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(800);
        console.log("  my-profile field value:", JSON.stringify(await page.inputValue(field)), "| step:", await page.getAttribute(field, "step"), "| min:", await page.getAttribute(field, "min"));
        await shoot(page, "admin-my-profile-per-message.png");
        await context.close();
      }
      // 7. the typed question survives the Stripe round-trip
      {
        const { context, page } = await openPage(browser, {
          mode: "per_message", session: perMessageSession(0),
          request: { status: 402, body: { detail: "INSUFFICIENT_BALANCE", required: 2, balance: 0, psychic_name: "Sophie" } },
        });
        const question = "will he come back? we broke up in march";
        await page.goto(`${APP}/reading/new/7`, { waitUntil: "networkidle" });
        await page.waitForSelector("#hall-rate", { timeout: 15000 });
        await page.fill("#q", question);
        await page.click("#begin");
        await page.waitForSelector("#hall-error", { timeout: 10000 });
        await page.waitForTimeout(800);
        const draftKey = "hall.question.draft";
        console.log("  402 error:", (await page.textContent("#hall-error"))?.trim(), "| glider open:", !!(await page.$("text=Secure Stripe checkout")));
        console.log("  draft saved:", JSON.stringify(await page.evaluate((k) => sessionStorage.getItem(k), draftKey)));
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForSelector("#hall-rate", { timeout: 15000 });
        console.log("  after plain reload — form:", JSON.stringify(await page.inputValue("#q")), "| key kept:", JSON.stringify(await page.evaluate((k) => sessionStorage.getItem(k), draftKey)));
        await page.goto(`${APP}/reading/new/7?topup=1&status=success`, { waitUntil: "networkidle" });
        await page.waitForSelector("#hall-rate", { timeout: 15000 });
        await page.waitForTimeout(1200);
        console.log("  after Stripe return — form:", JSON.stringify(await page.inputValue("#q")), "| key cleared:", (await page.evaluate((k) => sessionStorage.getItem(k), draftKey)) === null);
        await shoot(page, "hall-per-message-draft-restored.png");
        await context.close();
      }
      // 8. browse in per_message mode: a priced reader and an unpriced one, then the filter
      {
        const { context, page } = await openPage(browser, { mode: "per_message", session: perMessageSession(18), readers: [READER, READER_NO_MESSAGE_PRICE] });
        await page.goto(`${APP}/psychics-browse`, { waitUntil: "networkidle" });
        await page.waitForSelector(".gl-pc", { timeout: 15000 });
        await page.waitForSelector("text=per message", { timeout: 15000 });
        await page.waitForTimeout(1200);
        const cardsOf = () => page.$$eval(".gl-pc", (els) => els.map((e) => ({ name: e.querySelector(".gl-pname")?.textContent?.trim(), price: e.querySelector(".gl-price")?.textContent?.trim() ?? null, gift: e.querySelector(".gl-gift")?.textContent?.trim() ?? null })));
        console.log("  browse per_message cards:", JSON.stringify(await cardsOf()), "| count:", (await page.textContent(".gl-count"))?.trim(), "| chip:", (await page.textContent(".gl-filters button[title^='Price range']"))?.trim());
        await page.$eval(".gl-filters", (e) => e.scrollIntoView({ block: "start" }));
        await page.waitForTimeout(600);
        await shoot(page, "browse-per-message.png");
        await page.click("text=Any price");
        await page.fill('input[placeholder="Min"]', "1");
        await page.fill('input[placeholder="Max"]', "3");
        await page.click("text=Apply");
        await page.waitForTimeout(1200);
        console.log("  browse per_message filtered £1–£3:", JSON.stringify(await cardsOf()), "| count:", (await page.textContent(".gl-count"))?.trim());
        await page.$eval(".gl-filters", (e) => e.scrollIntoView({ block: "start" }));
        await page.waitForTimeout(600);
        await shoot(page, "browse-per-message-filtered.png");
        await page.click("text=/ message");
        await page.fill('input[placeholder="Min"]', "3");
        await page.fill('input[placeholder="Max"]', "9");
        await page.click("text=Apply");
        await page.waitForTimeout(1200);
        console.log("  browse per_message filtered £3–£9:", JSON.stringify(await cardsOf()), "| count:", (await page.textContent(".gl-count"))?.trim());
        await context.close();
      }
      // 8b. the reader's page in per_message mode
      {
        const { context, page } = await openPage(browser, { mode: "per_message", session: perMessageSession(18), readers: [READER, READER_NO_MESSAGE_PRICE] });
        await page.goto(`${APP}/psychics/7/details`, { waitUntil: "networkidle" });
        await page.waitForSelector("text=per message", { timeout: 15000 });
        await page.waitForTimeout(1200);
        console.log("  details per_message price:", (await page.textContent("text=per message >> xpath=.."))?.trim().replace(/\s+/g, " "));
        await shoot(page, "details-per-message.png");
        await context.close();
      }
      // 9. browse in per_minute mode: the control, exactly as today
      {
        const { context, page } = await openPage(browser, { mode: "per_minute", session: PER_MINUTE_SESSION, readers: [READER_PER_MINUTE, READER_NO_MESSAGE_PRICE] });
        await page.goto(`${APP}/psychics-browse`, { waitUntil: "networkidle" });
        await page.waitForSelector(".gl-pc", { timeout: 15000 });
        await page.waitForTimeout(1200);
        const cards = await page.$$eval(".gl-pc", (els) => els.map((e) => ({ name: e.querySelector(".gl-pname")?.textContent?.trim(), price: e.querySelector(".gl-price")?.textContent?.trim() ?? null, gift: e.querySelector(".gl-gift")?.textContent?.trim() ?? null })));
        console.log("  browse per_minute cards:", JSON.stringify(cards), "| count:", (await page.textContent(".gl-count"))?.trim(), "| chip:", (await page.textContent(".gl-filters button[title^='Price range']"))?.trim());
        await page.$eval(".gl-filters", (e) => e.scrollIntoView({ block: "start" }));
        await page.waitForTimeout(600);
        await shoot(page, "browse-per-minute-control.png");
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    vite.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

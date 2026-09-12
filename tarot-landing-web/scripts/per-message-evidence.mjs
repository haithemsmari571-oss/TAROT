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
    if (p === "/profile/me") return json(CLIENT);
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
  }, { token: TOKEN, user: CLIENT });
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
    } finally {
      await browser.close();
    }
  } finally {
    vite.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

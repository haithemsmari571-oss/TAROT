/* The rules behind the app's asks (ROUND59; src/features/client-app/appAsks.ts):
   which sheet a visit brings, the ask after a message, one sheet per visit,
   the pill's states, what a new visit is, where Safari keeps Share, and the
   steps that undo a browser's no.
   Run: node scripts/test-app-asks.mts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const asks = await import("../src/features/client-app/appAsks.ts");
const {
  visitAsk, afterMessageAsk, askApplies, freshVisit, decideVisit, messageSent, opened,
  pillState, pillFinished, isNewVisit, iosDevice, sharePlace, blockedPlace, BLOCKED_STEPS,
  NEW_VISIT_AFTER_MS, SETTLE_MS,
} = asks;

let checks = 0;
const check = (name: string, run: () => void) => {
  try { run(); checks += 1; } catch (error) { console.error(`FAILED: ${name}`); throw error; }
};

const ROUTES = ["prompt", "share-steps", null] as const;
const PUSH = ["checking", "off-server", "unsupported", "home-screen-first", "blocked", "on", "off"] as const;

check("the numbers the prompt gave", () => {
  assert.equal(NEW_VISIT_AFTER_MS, 30 * 60 * 1000);
  assert.equal(SETTLE_MS, 2000);
});

check("a visit: the home screen first, then notifications while off, else nothing", () => {
  for (const route of ROUTES) for (const push of PUSH) {
    const expected = route ? "install" : push === "off" ? "notify" : null;
    assert.equal(visitAsk(route, push), expected, `${route} ${push}`);
  }
  // An iPhone in Safari, not from the home screen: never the notification sheet.
  assert.equal(visitAsk("share-steps", "home-screen-first"), "install");
  // Blocked notifications and no install: nothing.
  assert.equal(visitAsk(null, "blocked"), null);
  // From the home screen (no route), notifications off: the notification sheet.
  assert.equal(visitAsk(null, "off"), "notify");
});

check("after a message: notifications while off; on an iPhone in Safari, the home screen", () => {
  assert.equal(afterMessageAsk("prompt", "off"), "notify");
  assert.equal(afterMessageAsk(null, "off"), "notify");
  assert.equal(afterMessageAsk("share-steps", "home-screen-first"), "install");
  for (const push of ["on", "blocked", "checking", "off-server", "unsupported"] as const) {
    assert.equal(afterMessageAsk("prompt", push), null, push);
  }
});

check("a sheet still applies when it opens", () => {
  assert.equal(askApplies("install", "prompt", "on"), true);
  assert.equal(askApplies("install", null, "off"), false);
  assert.equal(askApplies("notify", null, "off"), true);
  assert.equal(askApplies("notify", null, "on"), false);
  assert.equal(askApplies("notify", null, "blocked"), false);
});

check("one visit, one sheet: decided once, Not now holds until the next visit", () => {
  let state = freshVisit();
  assert.deepEqual(state, { shown: [], decided: false, afterMessage: false, waiting: null });
  // Not decided while push is still being read.
  assert.equal(decideVisit(state, "prompt", "checking"), state);
  state = decideVisit(state, "prompt", "off");
  assert.deepEqual(state.waiting, { sheet: "install", reader: null });
  assert.equal(state.decided, true);
  state = opened(state, "install");
  assert.deepEqual(state.shown, ["install"]);
  assert.equal(state.waiting, null);
  // Deciding again changes nothing: the visit has had its sheet.
  assert.deepEqual(decideVisit(state, "prompt", "off"), state);
  // A new visit starts afresh.
  assert.deepEqual(decideVisit(freshVisit(), "prompt", "off").waiting, { sheet: "install", reader: null });
});

check("the pill opened a sheet first: the visit brings none", () => {
  const state = decideVisit(opened(freshVisit(), "install"), "prompt", "off");
  assert.equal(state.waiting, null);
  assert.equal(state.decided, true);
  const afterAlertsTap = decideVisit(opened(freshVisit(), "notify"), null, "off");
  assert.equal(afterAlertsTap.waiting, null);
});

check("her first message of a visit: the ask once, never the same sheet twice", () => {
  // Android tab, install sheet shown and dismissed: the notification ask may follow her message.
  let state = opened(decideVisit(freshVisit(), "prompt", "off"), "install");
  state = messageSent(state, "prompt", "off", "Amrit");
  assert.deepEqual(state.waiting, { sheet: "notify", reader: "Amrit" });
  state = opened(state, "notify");
  // A second message in the same visit brings nothing.
  const again = messageSent(state, "prompt", "off", "Amrit");
  assert.equal(again.waiting, null);
  assert.deepEqual(again.shown, ["install", "notify"]);

  // The visit's notification sheet was shown and dismissed: the message brings nothing.
  let notified = opened(decideVisit(freshVisit(), null, "off"), "notify");
  notified = messageSent(notified, null, "off", "Sophie");
  assert.equal(notified.waiting, null);
  assert.equal(notified.afterMessage, true);

  // An iPhone in Safari: the install guide was this visit's sheet, so nothing after the message.
  const iphone = messageSent(opened(decideVisit(freshVisit(), "share-steps", "home-screen-first"), "install"), "share-steps", "home-screen-first", "Delphine");
  assert.equal(iphone.waiting, null);
  // An iPhone in Safari whose visit sheet has not opened yet: the message brings the install guide.
  const iphoneEarly = messageSent(freshVisit(), "share-steps", "home-screen-first", "Delphine");
  assert.deepEqual(iphoneEarly.waiting, { sheet: "install", reader: "Delphine" });
});

check("a message while the visit's sheet still waits takes its place: never both", () => {
  const waitingInstall = decideVisit(freshVisit(), "prompt", "off");
  const state = messageSent(waitingInstall, "prompt", "off", "Amrit");
  assert.deepEqual(state.waiting, { sheet: "notify", reader: "Amrit" });
  const shown = opened(state, "notify");
  assert.equal(shown.waiting, null);
  assert.deepEqual(shown.shown, ["notify"]);
  // Notifications already on: the message brings nothing and ends the after-message turn.
  const on = messageSent(freshVisit(), null, "on", "Amrit");
  assert.equal(on.waiting, null);
  assert.equal(on.afterMessage, true);
});

check("the pill: Get the app, then Turn on alerts, then gone; Alerts blocked", () => {
  assert.equal(pillState("prompt", "off", false), "install");
  assert.equal(pillState("share-steps", "home-screen-first", false), "install");
  assert.equal(pillState(null, "off", false), "alerts");
  assert.equal(pillState(null, "blocked", false), "blocked");
  assert.equal(pillState(null, "on", false), null);
  assert.equal(pillState(null, "checking", false), null);
  assert.equal(pillState(null, "off-server", false), null);
  assert.equal(pillState(null, "unsupported", false), null);
  // Finished for good on this device: never again, whatever happens later.
  for (const route of ROUTES) for (const push of PUSH) assert.equal(pillState(route, push, true), null);
});

check("the pill finishes only with notifications on and nothing left to add", () => {
  assert.equal(pillFinished(null, "on", false), true);
  assert.equal(pillFinished("prompt", "on", false), false);
  assert.equal(pillFinished("share-steps", "on", false), false);
  // Chrome offered the install this page load and it was turned down: not finished.
  assert.equal(pillFinished(null, "on", true), false);
  assert.equal(pillFinished(null, "off", false), false);
  assert.equal(pillFinished(null, "blocked", false), false);
});

check("a new visit: back after more than 30 minutes away", () => {
  const away = 1_000_000;
  assert.equal(isNewVisit(null, away), false);
  assert.equal(isNewVisit(away, away + 29 * 60 * 1000), false);
  assert.equal(isNewVisit(away, away + NEW_VISIT_AFTER_MS), false);
  assert.equal(isNewVisit(away, away + NEW_VISIT_AFTER_MS + 1), true);
  assert.equal(isNewVisit(away, away + 31 * 60 * 1000), true);
});

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  ipadSafari: "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  ipadDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0",
  iphoneHomeScreen: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

check("which Apple device", () => {
  assert.equal(iosDevice(UA.iphoneSafari, 5), "iphone");
  assert.equal(iosDevice(UA.ipadSafari, 5), "ipad");
  assert.equal(iosDevice(UA.ipadDesktopMode, 5), "ipad");
  assert.equal(iosDevice(UA.macSafari, 0), null);
  assert.equal(iosDevice(UA.androidChrome, 5), null);
  assert.equal(iosDevice(UA.windowsChrome, 0), null);
});

check("where Safari's Share button is", () => {
  assert.equal(sharePlace(UA.iphoneSafari, 5), "bottom");
  assert.equal(sharePlace(UA.ipadSafari, 5), "top-right");
  assert.equal(sharePlace(UA.ipadDesktopMode, 5), "top-right");
  // Another browser, an in-app browser, or no Safari at all: no arrow.
  assert.equal(sharePlace(UA.iphoneChrome, 5), null);
  assert.equal(sharePlace(UA.iphoneInstagram, 5), null);
  assert.equal(sharePlace(UA.iphoneHomeScreen, 5), null);
  assert.equal(sharePlace(UA.androidChrome, 5), null);
  assert.equal(sharePlace(UA.macSafari, 0), null);
});

check("how to undo a browser's no, for her browser", () => {
  assert.equal(blockedPlace(UA.iphoneHomeScreen, 5, true), "ios-app");
  assert.equal(blockedPlace(UA.androidChrome, 5, true), "android-app");
  assert.equal(blockedPlace(UA.androidChrome, 5, false), "browser");
  assert.equal(blockedPlace(UA.macSafari, 0, false), "mac-safari");
  assert.equal(blockedPlace(UA.macChrome, 0, false), "browser");
  assert.equal(blockedPlace(UA.windowsChrome, 0, false), "browser");
  for (const place of ["ios-app", "android-app", "mac-safari", "browser"] as const) {
    const steps = BLOCKED_STEPS[place]("Ask Valentina", "askvalentina.co.uk");
    assert.ok(steps.length >= 2 && steps.length <= 3, place);
    for (const step of steps) assert.ok(step.endsWith("."), step);
  }
  assert.match(BLOCKED_STEPS["ios-app"]("Ask Valentina", "x").join(" "), /Notifications, then Ask Valentina/);
  assert.match(BLOCKED_STEPS["mac-safari"]("Ask Valentina", "askvalentina.co.uk").join(" "), /askvalentina\.co\.uk to Allow/);
});

check("the words on screen are the prompt's, and none mentions AI", () => {
  const sheets = readFileSync(new URL("../src/features/client-app/AppSheets.tsx", import.meta.url), "utf8");
  for (const words of [
    "Never miss a reply from your reader", "Want to know the moment ${reader} replies?", "Yes, notify me",
    "Not now", "Got it", "Add ${BRAND_NAME} to your home screen", "Get the app", "Turn on alerts", "Alerts blocked",
  ]) assert.ok(sheets.includes(words), words);
  const copy = sheets.slice(sheets.indexOf("export const SHEET_COPY"), sheets.indexOf("} as const;"));
  assert.doesNotMatch(copy, /\bAI\b|artificial|\bbot\b|automat/i);
  const rules = readFileSync(new URL("../src/features/client-app/appAsks.ts", import.meta.url), "utf8");
  const steps = rules.slice(rules.indexOf("export const BLOCKED_STEPS"));
  assert.doesNotMatch(steps, /\bAI\b|artificial|\bbot\b|automat/i);
  // The old "3 times, 3 days apart" records are gone.
  assert.ok(!sheets.includes("SHEET_TIMES") && !sheets.includes("SHEET_GAP_DAYS"));
});

console.log(`test-app-asks: all ${checks} checks passed`);

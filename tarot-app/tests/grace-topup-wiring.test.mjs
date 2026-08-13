import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const apiSource = readFileSync(new URL("../src/api/chat.ts", import.meta.url), "utf8");
const sessionSource = readFileSync(
  new URL("../app/sessions/[chatId].tsx", import.meta.url),
  "utf8"
);

test("grace top-up tells the server before opening website billing", () => {
  assert.match(
    apiSource,
    /export async function startChatTopUp\(chatId: number\)[\s\S]*?api\.post\(`\/api\/chat\/\$\{chatId\}\/topup`\)/
  );

  const handlerStart = sessionSource.indexOf("const onTopUp = useCallback");
  const handlerEnd = sessionSource.indexOf("const onTopUpReconnect", handlerStart);
  assert.notEqual(handlerStart, -1, `${appRoot}: onTopUp handler is missing`);
  assert.notEqual(handlerEnd, -1, `${appRoot}: onTopUp handler boundary is missing`);

  const handler = sessionSource.slice(handlerStart, handlerEnd);
  const graceGuard = handler.indexOf('sessionStatus === "GRACE"');
  const serverHold = handler.indexOf("await startChatTopUp(chatId)");
  const websiteBilling = handler.indexOf("await openBillingPage()");

  assert.ok(graceGuard >= 0, "GRACE guard is missing");
  assert.ok(serverHold > graceGuard, "server hold is not inside the GRACE path");
  assert.ok(
    websiteBilling > serverHold,
    "website billing opens before the server extends the grace hold"
  );
});

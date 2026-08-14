import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const config = fs.readFileSync(path.resolve("nginx.conf"), "utf8");
const crmLocation = config.match(/location \^~ \/crm\/ \{([\s\S]*?)\n    \}/)?.[1];

assert(crmLocation, "The production nginx config must retain the /crm/ proxy location.");
assert.match(
  crmLocation,
  /client_max_body_size\s+20g\s*;/,
  "The /crm/ proxy must use Iris's documented 20 GB long-video limit.",
);
assert.match(
  crmLocation,
  /proxy_request_buffering\s+off\s*;/,
  "The /crm/ proxy must stream long-video request bodies instead of buffering them.",
);

const uploadLimitDirectives = config.match(/client_max_body_size\s+[^;]+;/g) ?? [];
assert.deepEqual(
  uploadLimitDirectives,
  ["client_max_body_size 20g;"],
  "The production proxy should expose one narrowly scoped long-video limit.",
);

console.log("CRM long-video nginx contract passed.");

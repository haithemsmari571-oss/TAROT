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

// The API proxy has its own, much smaller ceiling (dcec0cb, 23 Aug 2026, after
// this test was written): library audio and video go straight to R2 through
// presigned URLs, so the largest body the API takes is a 12 MB hall sound
// (TAROT-BACKEND services/hall_sounds.py MAX_HALL_SOUND_BYTES) plus multipart
// overhead.
const apiLocation = config.match(/location \/api\/ \{([\s\S]*?)\n    \}/)?.[1];
assert(apiLocation, "The production nginx config must retain the /api/ proxy location.");
assert.match(
  apiLocation,
  /client_max_body_size\s+25m\s*;/,
  "The /api/ proxy must keep its 25 MB ceiling for the backend's uploads.",
);

// Exactly those two limits, each inside its own location: no server-wide
// limit, so every other location keeps nginx's 1 MB default.
const uploadLimitDirectives = config.match(/client_max_body_size\s+[^;]+;/g) ?? [];
assert.deepEqual(
  uploadLimitDirectives,
  ["client_max_body_size 20g;", "client_max_body_size 25m;"],
  "The production proxy should expose only the scoped /crm/ long-video and /api/ upload limits.",
);

console.log("CRM long-video nginx contract passed.");

// Vulcan embedded mode — OFF by default.
//
// This activates ONLY when the admin panel is embedded inside the Second Brain
// CRM's "Vulcan" room, and only after a postMessage handshake from the trusted
// CRM origin. When active, DESTRUCTIVE API calls (delete / balance / refund /
// price / role / suspend / settings / claims) are diverted to the CRM's
// approval gateway (via postMessage) instead of firing directly at the API;
// safe reads and reversible edits are untouched.
//
// The standalone admin panel is never framed by the CRM, so this never
// activates there — its behavior is 100% unchanged. The classifier mirrors the
// CRM server's tested classifier (secondbrain/crm/src/server/vulcan/classify.ts).

const EMBED_ORIGIN =
  (import.meta.env.VITE_VULCAN_EMBED_ORIGIN as string | undefined)?.trim() ||
  "http://127.0.0.1:4317";

let active = false;
let sequence = 0;

export function isVulcanEmbedActive(): boolean {
  return active;
}

// The embedding CRM window. For a single-level iframe this is always
// window.parent — more robust than relying on a message's event.source, which
// some environments don't populate for cross-origin messages.
function embedder(): Window | null {
  try {
    return typeof window !== "undefined" && window.parent && window.parent !== window ? window.parent : null;
  } catch {
    return null;
  }
}

interface DestructiveRule {
  method: RegExp;
  path: RegExp;
  bodyFields?: string[];
  reason: string;
}

// `path` is the FULL api path incl. the /api prefix (we prepend it before matching).
const DESTRUCTIVE_RULES: DestructiveRule[] = [
  { method: /^DELETE$/, path: /^\/api\/psychic\/\d+/, reason: "Deletes a psychic account." },
  { method: /^PATCH$/, path: /^\/api\/psychic\/\d+/, bodyFields: ["price_per_second"], reason: "Changes a psychic's billing rate." },
  { method: /^DELETE$/, path: /^\/api\/admin\/users\/\d+/, reason: "Removes a user account." },
  { method: /^(POST|PATCH)$/, path: /^\/api\/admin\/users\/\d+\/(suspend|role)/, reason: "Suspends a user or changes their role." },
  { method: /^POST$/, path: /^\/api\/admin\/users\/\d+\/(gift|adjust-balance|balance)/, reason: "Moves real balance on a customer account." },
  { method: /^PATCH$/, path: /^\/api\/admin\/users\/\d+$/, bodyFields: ["balance", "password", "role"], reason: "Changes a user's balance, password or role." },
  { method: /^(POST|PATCH|PUT|DELETE)$/, path: /^\/api\/admin\/refunds/, reason: "Issues or alters a refund." },
  { method: /^(POST|PATCH|PUT|DELETE)$/, path: /^\/api\/admin\/settings/, reason: "Changes money-critical system settings." },
  { method: /^(POST|PATCH)$/, path: /^\/api\/admin\/claims/, reason: "Approving claims credits Stardust to accounts." },
];

export function classifyDestructive(
  method: string,
  apiPath: string,
  body?: unknown,
): { destructive: boolean; reason: string } {
  const m = method.toUpperCase();
  const p = apiPath.split("?")[0];
  const record = body && typeof body === "object" && !(body instanceof FormData)
    ? (body as Record<string, unknown>)
    : undefined;
  for (const rule of DESTRUCTIVE_RULES) {
    if (!rule.method.test(m) || !rule.path.test(p)) continue;
    if (rule.bodyFields && !rule.bodyFields.some((f) => record && record[f] !== undefined && record[f] !== null)) {
      continue;
    }
    return { destructive: true, reason: rule.reason };
  }
  return { destructive: false, reason: "" };
}

export function divertToVulcan(method: string, apiPath: string, body: unknown, reason: string): void {
  if (!active) return;
  embedder()?.postMessage(
    {
      type: "vulcan:destructive",
      id: ++sequence,
      request: { method: method.toUpperCase(), path: apiPath.split("?")[0], body: body ?? undefined },
      reason,
    },
    EMBED_ORIGIN,
  );
}

export function initVulcanEmbed(): void {
  // Not framed → never activate. This is the guarantee that the standalone
  // panel is unaffected.
  if (typeof window === "undefined" || window.top === window.self) return;

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== EMBED_ORIGIN) return; // only the trusted CRM origin
    const data = event.data as { type?: string } | null;
    if (data?.type === "vulcan:activate") {
      active = true;
      embedder()?.postMessage({ type: "vulcan:activated" }, EMBED_ORIGIN);
    }
  });
}

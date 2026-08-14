import assert from "node:assert/strict";
import { crmDestinationForAdminPath } from "../src/admin-crm-routes.ts";

const destinations: Readonly<Record<string, string>> = {
  "/admin/dashboard": "/crm/#/money-and-stats?screen=stats",
  "/admin/users": "/crm/#/clients-and-psychics?screen=users",
  "/admin/clients": "/crm/#/agent/valentina?view=clients",
  "/admin/psychics": "/crm/#/agent/vulcan?screen=practitioners",
  "/admin/onboarding": "/crm/#/agent/vulcan?screen=onboarding",
  "/admin/reader-activity": "/crm/#/money-and-stats?screen=activity",
  "/admin/categories": "/crm/#/agent/vulcan?screen=categories",
  "/admin/zodiac": "/crm/#/agent/vulcan?screen=zodiac",
  "/admin/lifepath": "/crm/#/agent/vulcan?screen=lifepath",
  "/admin/buy-options": "/crm/#/money-and-stats?screen=tiers",
  "/admin/landing": "/crm/#/agent/vulcan?screen=landing",
  "/admin/tasks": "/crm/#/agent/vulcan?screen=tasks",
  "/admin/claims": "/crm/#/agent/vulcan?screen=claims",
  "/admin/ledger": "/crm/#/money-and-stats?screen=transactions",
  "/admin/chats": "/crm/#/agent/valentina?view=cockpit",
  "/admin/notifications": "/crm/#/agent/valentina?view=cockpit&notifications=open",
  "/admin/ai-prompts": "/crm/#/agent/vulcan?screen=prompts",
  "/admin/rituals-settings": "/crm/#/agent/vulcan?screen=rituals-settings",
  "/admin/settings": "/crm/#/agent/vulcan?screen=settings",
};

for (const [source, expected] of Object.entries(destinations)) {
  assert.equal(crmDestinationForAdminPath(source), expected, source);
  assert.equal(crmDestinationForAdminPath(`${source}/`), expected, `${source}/`);
}

assert.equal(crmDestinationForAdminPath("/admin/chats/42"), "/crm/#/agent/valentina?view=cockpit&chat=42");
assert.equal(crmDestinationForAdminPath("/admin/chats/42/"), "/crm/#/agent/valentina?view=cockpit&chat=42");
assert.equal(crmDestinationForAdminPath("/admin/chats/not-a-number"), "/crm/#/agent/valentina?view=cockpit");
assert.equal(crmDestinationForAdminPath("/admin/unknown"), "/crm/#/control");
assert.equal(crmDestinationForAdminPath("/not-admin/claims"), "/crm/#/control");

console.log(`admin CRM routes: ${Object.keys(destinations).length + 5} checks passed`);

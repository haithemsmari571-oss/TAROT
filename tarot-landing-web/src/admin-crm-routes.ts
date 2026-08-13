const VULCAN_SCREENS: Readonly<Record<string, string>> = {
  psychics: "practitioners",
  onboarding: "onboarding",
  categories: "categories",
  zodiac: "zodiac",
  lifepath: "lifepath",
  "life-path": "lifepath",
  landing: "landing",
  tasks: "tasks",
  claims: "claims",
  "ai-prompts": "prompts",
  "rituals-settings": "rituals-settings",
  settings: "settings",
};

const MONEY_SCREENS: Readonly<Record<string, string>> = {
  dashboard: "stats",
  "reader-activity": "activity",
  "buy-options": "tiers",
  ledger: "transactions",
};

export function crmDestinationForAdminPath(pathname: string): string {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const match = normalizedPath.match(/^\/admin(?:\/([^/]+))?(?:\/(.*))?$/);
  if (!match) return "/crm/#/control";
  const section = match[1] ?? "";
  const remainder = match[2] ?? "";

  if (section === "chats") {
    const chatId = /^[1-9]\d*$/.test(remainder) ? `&chat=${remainder}` : "";
    return `/crm/#/agent/valentina?view=cockpit${chatId}`;
  }
  if (section === "notifications") return "/crm/#/agent/valentina?view=cockpit&notifications=open";
  if (section === "clients") return "/crm/#/agent/valentina?view=clients";
  if (section === "users") return "/crm/#/clients-and-psychics?screen=users";

  const moneyScreen = MONEY_SCREENS[section];
  if (moneyScreen) return `/crm/#/money-and-stats?screen=${moneyScreen}`;

  const vulcanScreen = VULCAN_SCREENS[section];
  if (vulcanScreen) return `/crm/#/agent/vulcan?screen=${vulcanScreen}`;

  return "/crm/#/control";
}

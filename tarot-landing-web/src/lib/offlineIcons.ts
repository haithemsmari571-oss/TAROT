/* Every icon the site draws, inside the build. The site used to fetch each icon
   from api.iconify.design while the page drew it, so icon-only buttons went
   blank when that host was slow or blocked, and every visit told a third party.
   vite.config.ts points "@iconify/react" at this file, so every
   `import { Icon } from "@iconify/react"` keeps its code and draws with the
   package's offline build, which never fetches: an icon that is not in
   offlineIcons.json draws nothing, as an icon unknown to Iconify always did.
   offlineIcons.json is the icon API's own data for exactly the icons the site's
   source names, plus ph:<platform>-logo-fill for the footer's social links
   (their platform comes from the landing content). To add an icon, add its
   entry from https://api.iconify.design/<set>.json?icons=<name>;
   `npm run test:offline-icons` names any icon the source uses that is missing. */
import { addCollection, type IconifyJSON } from "@iconify/react/offline";
import iconSets from "./offlineIcons.json";

// TypeScript types the JSON as a union of its own sets, which does not overlap
// Iconify's index-signature type; the data is the icon API's IconifyJSON as served.
for (const set of iconSets as unknown as IconifyJSON[]) addCollection(set);

export { Icon } from "@iconify/react/offline";

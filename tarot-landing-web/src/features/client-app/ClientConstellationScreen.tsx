/* /app/you/constellation: the daily Constellation (features/profile/views/
   ClientProfile.tsx) inside the app shell. The page's own Sign out and
   balance card are hidden by client-more.css. Its "Ask Valentina" and the
   celebration's "Use my Stardust" go to /psychics-browse, which sends a
   signed-in client on to /app/readers (App.tsx, CLIENT_APP_REDIRECTS). */
import { ClientProfile } from "@/features/profile/views";
import { MORE_LINKS, MoreScreen } from "./ClientMoreScreen";

export default function ClientConstellationScreen() {
  return (
    <MoreScreen title={MORE_LINKS.constellation.label} kind="constellation">
      <ClientProfile />
    </MoreScreen>
  );
}

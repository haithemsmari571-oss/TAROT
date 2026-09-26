/* /app/you/privacy: the site's Privacy Policy page (features/privacy/views/
   PrivacyPage.tsx) inside the app shell. The page draws no chrome of its
   own; client-more.css takes only its page pad away. */
import { PrivacyPage } from "@/features/privacy/views";
import { MORE_LINKS, MoreScreen } from "./ClientMoreScreen";

export default function ClientPrivacyScreen() {
  return (
    <MoreScreen title={MORE_LINKS.privacy.label} kind="legal">
      <PrivacyPage />
    </MoreScreen>
  );
}

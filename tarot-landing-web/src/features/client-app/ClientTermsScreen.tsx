/* /app/you/terms: the site's Terms of Service page (features/terms/views/
   TermsPage.tsx) inside the app shell. The page draws no chrome of its own;
   client-more.css takes only its page pad away. */
import { TermsPage } from "@/features/terms/views";
import { MORE_LINKS, MoreScreen } from "./ClientMoreScreen";

export default function ClientTermsScreen() {
  return (
    <MoreScreen title={MORE_LINKS.terms.label} kind="legal">
      <TermsPage />
    </MoreScreen>
  );
}

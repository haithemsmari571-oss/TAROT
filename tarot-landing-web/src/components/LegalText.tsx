/* The Terms and Privacy pages' text (TermsPage.tsx, PrivacyPage.tsx): the
   owner's own words from the public settings (GET /settings/public), drawn as
   markdown. While they load, "Loading..."; when they cannot load, the short
   general line with Try again, never "Loading..." for ever (ROUND38). A text
   the settings do not hold counts as not loaded. */
import { useQuery } from "@tanstack/react-query";
import axiosClient from "../lib/axiosClient";
import { REFUSAL_FALLBACK } from "../lib/serverRefusal";
import { PUBLIC_SETTINGS_PATH } from "../features/client-app/useWelcomeCredit";
import MarkdownRenderer from "./MarkdownRenderer";

type LegalField = "terms_of_service" | "privacy_policy";

// The text opens with its own title ("# Terms of Service"), and the page
// already draws that title as its h1, so the text's first "# " line is not
// drawn a second time (ROUND44).
const OWN_TITLE_LINE = /^# [^\n]*\n*/;

export default function LegalText({ field }: { field: LegalField }) {
  const text = useQuery({
    queryKey: ["legal-text", field],
    queryFn: async () => {
      const { data } = await axiosClient.get<Partial<Record<LegalField, string>>>(PUBLIC_SETTINGS_PATH);
      const content = data?.[field];
      if (!content) throw new Error(`No ${field} in the public settings`);
      return content;
    },
  });

  if (text.data) return <MarkdownRenderer content={text.data.replace(OWN_TITLE_LINE, "")} />;
  if (text.isError && !text.isFetching) {
    return (
      <div className="gl-state">
        <p role="alert">{REFUSAL_FALLBACK}</p>
        <button type="button" className="gl-btn-ghost" onClick={() => void text.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <div className="gl-state">
      <p>Loading...</p>
    </div>
  );
}

/* /app/you/help, Help & contact (ROUND39), the last row of the You tab's More
   card: the support address, which opens her mail app, the one line on how to
   make a complaint, and who runs the site. The words are lib/company.ts's, the
   same the site's footer shows. No request of its own. The contact row is the
   More card's own row (client-you.css, .client-you-more). */
import { COMPLAINT_LINE, CONTACT_LABEL, SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/company";
import { AccountFrame, CompanyLegal } from "./ClientAccountForm";
import { MORE_LINKS } from "./ClientMoreScreen";

export default function ClientHelpScreen() {
  return (
    <AccountFrame title={MORE_LINKS.help.label}>
      <section className="client-you-section" aria-label={CONTACT_LABEL}>
        <p className="client-chats-eyebrow">{CONTACT_LABEL}</p>
        <div className="client-you-card client-you-more">
          <nav className="client-you-links" aria-label={CONTACT_LABEL}>
            <a href={SUPPORT_MAILTO} className="client-you-link">
              {SUPPORT_EMAIL}
              <span className="client-you-link-end">
                <span className="client-you-link-chevron" aria-hidden="true">›</span>
              </span>
            </a>
          </nav>
          <p className="client-you-sub client-you-complaint">{COMPLAINT_LINE}</p>
        </div>
      </section>
      <CompanyLegal />
    </AccountFrame>
  );
}

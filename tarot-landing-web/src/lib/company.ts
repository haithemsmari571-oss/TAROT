/* Who runs the site, in the owner's exact words (ROUND39): the brand, the
   company behind it, its registered office and the support address. The one
   source for the site's footer (layouts/Footer.tsx), the prerendered pages'
   footer (prerender/MarketingShell.tsx), and the app's Help & contact screen
   and the foot of its You tab. The backend's emails carry the same words from
   their own constants (TAROT-BACKEND app/services/email.py). */

export const BRAND_NAME = "Ask Valentina";

/** The footer's copyright line; the CMS cannot change it (Footer.tsx). */
export const COPYRIGHT_LINE = `© 2026 ${BRAND_NAME}`;

export const COMPANY_NAME = "Numinous Holdings Ltd";

export const COMPANY_IDENTITY = `${BRAND_NAME} is a trading name of ${COMPANY_NAME}, a company registered in England and Wales (company number 17151844).`;

export const REGISTERED_OFFICE = "66 Paul Street, London, EC2A 4NA";
export const REGISTERED_OFFICE_LINE = `Registered office: ${REGISTERED_OFFICE}`;

export const SUPPORT_EMAIL = "support@askvalentina.co.uk";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
export const CONTACT_LABEL = "Contact";

/** The app's Help & contact screen: one line on complaints, to the same address. */
export const COMPLAINT_LINE = `How to make a complaint: email ${SUPPORT_EMAIL}.`;

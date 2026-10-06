/* The email box on sign-in and sign-up (ROUND64). Both forms are noValidate:
   the page checks the email itself and says what is wrong in its own words.
   Safari's own "Enter an email address" told her nothing when her iPhone had
   filled in her username, or had left an invisible character after an
   address that looked right (ROUND63). */

export const ENTER_EMAIL = "Please enter your email address.";
export const NOT_AN_EMAIL =
  "That doesn't look like an email address. Your iPhone may have filled in your username. Please type the email you signed up with.";

/* Characters that show as nothing, or as an ordinary space, and have no place
   in an email address: every space but the plain one (the no-break spaces
   among them) and every format character (zero-width spaces and joiners, the
   word joiner, direction marks, the BOM, the soft hyphen). A paste or an
   iPhone fill can leave them anywhere in the box. */
const INVISIBLE = /[^\S ]|\p{Cf}/gu;

/** The email the box holds, with every invisible character removed and trimmed. */
export function cleanEmail(typed: string): string {
  return typed.replace(INVISIBLE, "").trim();
}

/** What is wrong with a cleaned email, in the page's words, or null for an
    email address. "An email address" is the browser's own rule for an email
    box, the one Safari applied before, so nothing it let through is refused. */
export function emailProblem(email: string): string | null {
  if (!email) return ENTER_EMAIL;
  const probe = document.createElement("input");
  probe.type = "email";
  probe.value = email;
  return probe.validity.typeMismatch ? NOT_AN_EMAIL : null;
}

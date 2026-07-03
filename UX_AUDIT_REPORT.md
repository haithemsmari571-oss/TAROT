# Ask Valentina — UX Audit Report

**Scope:** `tarot-landing-web/` (public site + client portal) and `tarot-app/` (Expo mobile app, in development).
**Lens:** Would a 35–55-year-old, moderately tech-comfortable woman — often visiting at night, on a small phone, during an emotionally stressful moment — find this effortless on the first try, with zero explanation?
**Status:** Analysis only. No code was changed.

---

## Executive summary

The mobile app is in noticeably better shape for this audience than the website. Its sign-up, sessions list, and live chat screens use warm, plain English, plainly-worded errors ("Couldn't load your chats. Pull to retry."), a clear live session bar (time used / time remaining / balance), and gentle "waiting for your reader" language. The website, by contrast, has a serious tone problem on the exact screens where trust is won or lost: the sign-up and email-verification pages are written in cold science-fiction language ("Join the Council," "Create your neural profile," placeholder text like "AGENT_NAME_00" and "IDENTITY@COUNCIL.IO," and a submit button labelled "Initialize Profile"). That copy is off-brand for a psychic love-reading service and will confuse or alienate the target user within seconds. Compounding it, those same forms use very small (9–10px), all-uppercase, widely-letter-spaced text with placeholder text set to roughly 10% opacity, which is close to invisible on the dark background. Across both platforms there is no reachable Help or Support link anywhere — the only mention of support is a line of non-clickable text on the billing error screen. Two moments also ask the user to commit before they understand the cost: the app lets a user tap "Start Reading" and immediately open a paid request with no view of the per-minute rate or their balance, and "Stardust" is never explained before someone is asked to buy it. None of this requires a redesign — the highest-impact fixes are copy rewrites, font-size/contrast bumps, adding a Help link, and inserting one confirmation step before a paid action.

---

## Findings by screen / flow

### A. Website — Sign-up page
**File:** `tarot-landing-web/src/features/auth/views/register.tsx`

**A1 — Sci-fi / technical copy throughout the sign-up form**
- **Severity:** Critical · **Type:** Fix
- **Lines:** `85–89` ("Join the Council" / "Create your neural profile to unlock cosmic insights"), `129` (placeholder `AGENT_NAME_00`), `144` (placeholder `IDENTITY@COUNCIL.IO`), `197` (button "Initialize Profile"), `209–216` ("Already verified in the archives?" / "Authorized Login").
- **What the user experiences:** She arrives to sign up for a tarot love reading and is met with robotic "council/agent/neural profile" language that feels like the wrong website, making her hesitate or leave.
- **Recommendation:** Rewrite all copy in warm, human language: heading "Create your account," subtext "Join Ask Valentina to connect with a gifted reader," placeholders "Your name" / "you@email.com," button "Create account," and footer "Already have an account? Sign in." Match the friendly tone the mobile app already uses in `tarot-app/app/signup.tsx`.

**A2 — Form text is tiny, all-caps, and heavily letter-spaced**
- **Severity:** High · **Type:** Fix
- **Lines:** `51–54` (`inputClasses`: `text-[10px] font-black tracking-[0.2em]` uppercase), labels at `text-[9px]` (`123`, `138`, `154`, `165`).
- **What the user experiences:** She squints at 9–10px uppercase labels and struggles to read what each field wants, especially at night on a phone.
- **Recommendation:** Use normal sentence-case labels at ~14px and input text at ~16px (16px also prevents mobile browsers from zooming on focus). Remove the heavy uppercase + letter-spacing on form fields.

**A3 — Placeholder text is nearly invisible**
- **Severity:** High · **Type:** Fix
- **Lines:** `52` (`placeholder:text-white/10`).
- **What the user experiences:** The example text inside each box is so faint she can't tell what format to type.
- **Recommendation:** Raise placeholder opacity to at least ~40–50% white (`text-white/40`+) so it's legible but still clearly a placeholder.

**A4 — Password rules only appear after a failed attempt**
- **Severity:** Low · **Type:** Improve
- **Lines:** `43–46` (min-6 check only on submit).
- **What the user experiences:** She picks a short password, gets rejected, and only then learns the 6-character rule.
- **Recommendation:** Show "At least 6 characters" as helper text under the password field from the start, and add a show/hide (eye) toggle.

---

### B. Website — Verify-email page
**File:** `tarot-landing-web/src/features/auth/views/verify-email.tsx`

**B1 — Same tiny-text / low-contrast form styling as sign-up**
- **Severity:** High · **Type:** Fix
- **Lines:** `55–58` (identical `inputClasses`), `78`, `101–103`, `120` (status copy at `text-[9px]` uppercase).
- **What the user experiences:** The "check your email / resend link" screen is hard to read at the very moment she's anxious about whether her account worked.
- **Recommendation:** Apply the same font-size/contrast fixes as A2/A3; keep the reassurance message ("We've sent a link to …") at a comfortable ~14–15px.

**B2 — Resend-verification field styling repeats invisible placeholder**
- **Severity:** Medium · **Type:** Fix
- **Lines:** `145` (`your@email.com` placeholder at `text-white/10`).
- **What the user experiences:** She isn't sure the email box is even active because the hint text is barely visible.
- **Recommendation:** Same placeholder-opacity fix as A3.

> Note: `login.tsx` almost certainly shares this `inputClasses` pattern — apply the same three fixes there.

---

### C. Website — Navigation, orientation & support
**File:** `tarot-landing-web/src/layouts/Navbar.tsx`

**C1 — No Help / Support link anywhere in the app**
- **Severity:** High · **Type:** Add
- **Evidence:** Nav items (`94–105`) and mobile drawer (`266–324`) contain no support/contact entry; a repo-wide search found the word "support" only as non-clickable prose on the billing error modal (`tarot-landing-web/src/features/payment/views/Billing.tsx:997–998`). The mobile app has no support reference at all.
- **What the user experiences:** When something goes wrong with a payment or a reading, she has no obvious way to reach a human and feels stuck.
- **Recommendation:** Add a visible "Help" entry to the nav bar and mobile drawer (and app Profile screen) that opens a support email (`mailto:`) or a simple help page. Make the billing-modal "contact support" text an actual clickable link.

**C2 — Cold microcopy in the account button**
- **Severity:** Low · **Type:** Improve
- **Lines:** `185` ("View Identity").
- **What the user experiences:** The label under her name reads like a security system, not a friendly profile.
- **Recommendation:** Change "View Identity" to "View profile" (or remove the sub-label).

**C3 — Terminology differs from the mobile app**
- **Severity:** Medium · **Type:** Fix
- **Lines:** `97` (nav item "Chats"), `102` (nav item "Sanctuary").
- **What the user experiences:** On the website her conversations are under "Chats," but the app calls the same thing "Sessions," so moving between the two she wonders if they're different features.
- **Recommendation:** Pick one word for the reading conversation ("Sessions" or "Readings") and use it in both the website nav and the app tab bar. Keep "Stardust" and "Reading/Session" consistent everywhere.

---

### D. Website — Auth page motion
**Files:** `register.tsx` (`231`, `243–262`), `verify-email.tsx` (`188`, `198–216`)

**D1 — Constant mouse-parallax and infinitely pulsing stars on auth screens**
- **Severity:** Low · **Type:** Improve
- **What the user experiences:** The background subtly drifts as she moves the mouse and 50 stars pulse continuously, which can feel restless on a screen where she's trying to concentrate on typing.
- **Recommendation:** Calm these screens: drop the mouse-parallax on the form side and slow/reduce the star animation, and honor "reduce motion" settings. (Also, the stars use random positions recomputed on each render — pin them once so they don't jitter.)

---

### E. Mobile app — Bottom navigation
**File:** `tarot-app/app/_layout.tsx`

**E1 — Tab bar is clear (icons + labels both present)**
- **Severity:** Low · **Type:** Improve
- **Lines:** `16–21` (icon per tab), `60–64` (label `fontSize: 10`).
- **What the user experiences:** She can see all four destinations with icon + word, which is good; the labels are just a touch small.
- **Recommendation:** Keep the icon+label pattern (it's correct); consider bumping the tab label to 11–12px for easier reading. No structural change needed.

---

### F. Mobile app — Sign in / sign up
**Files:** `tarot-app/app/profile.tsx`, `tarot-app/app/signup.tsx`

**F1 — "Sign in" is hidden inside the Profile tab**
- **Severity:** Medium · **Type:** Improve
- **Evidence:** Signed-out users see the sign-in form only by opening **Profile** (`profile.tsx:31`), and the Sessions empty state tells them to "Head to the Profile tab to sign in" (`sessions/index.tsx:104–108`).
- **What the user experiences:** Not logged in, she doesn't intuitively guess that "Profile" is where you sign in, so she may feel lost.
- **Recommendation:** Either rename the tab context or add a clear "Sign in" affordance on the Sanctuary/Sessions screens; at minimum keep the helpful pointer text but consider a "Sign in" button that jumps straight there.

**F2 — No "Forgot password?" on the app sign-in form**
- **Severity:** Medium · **Type:** Add
- **File/area:** `profile.tsx` `SignInForm` (`90–186`).
- **What the user experiences:** If she's forgotten her password she hits a dead end with no reset path.
- **Recommendation:** Add a "Forgot password?" link under the sign-in button that opens the existing web reset flow (or a native one).

**F3 — Sign-up flow is warm and well-built (positive)**
- **Severity:** Low · **Type:** (praise / keep)
- **Evidence:** `signup.tsx` — friendly copy, inline validation with plain messages (`52–66`), clear "Check your email" confirmation state (`88–112`), visible Back link. This is the model the website should follow.

---

### G. Mobile app — Stardust / billing
**Files:** `tarot-app/app/stardust.tsx`, `tarot-app/app/profile.tsx`

**G1 — "Stardust" is never explained before the user is asked to buy**
- **Severity:** High · **Type:** Add
- **Evidence:** `stardust.tsx` shows the balance, preset amounts, and a live preview but no primer on what Stardust is, that $1 = 1 Stardust, or how it's spent (per-minute readings). Profile shows a bare "STARDUST" number (`profile.tsx:56–68`).
- **What the user experiences:** She's asked to pay for "Stardust" without being told what it is or how it gets used, which creates hesitation right at the payment step.
- **Recommendation:** Add one plain sentence near the balance/purchase area, e.g. "Stardust is your reading credit — $1 = 1 Stardust, used minute-by-minute during a reading." Show it on both the Profile balance card and the Stardust screen.

**G2 — Purchase preview and processing states are clear (positive)**
- **Severity:** Low · **Type:** (praise / keep)
- **Evidence:** `stardust.tsx:230–251` ("You'll receive," bonus breakdown, "Estimate only — the exact amount is confirmed securely at checkout"), and the post-checkout "Payment processing, pull to refresh" notice (`69`). Reassuring and honest — keep it.

---

### H. Mobile app — Browse psychics & request a reading
**Files:** `tarot-app/app/psychics/[id].tsx`, `tarot-app/app/psychics/index.tsx`, `tarot-app/src/components/PsychicCard.tsx`

**H1 — "Start Reading" commits to a paid request with no cost/expectation shown**
- **Severity:** High · **Type:** Add
- **Evidence:** `psychics/[id].tsx:50–70` — tapping START READING immediately calls `requestChat` with a hardcoded opening message and navigates away; the per-minute rate (`220–221`) and the user's balance are visible on the profile but never confirmed at the moment of committing.
- **What the user experiences:** She taps what looks like a "learn more" button and finds she's already sent a paid reading request, with no clear moment to check the rate or her balance first.
- **Recommendation:** Insert a lightweight confirmation sheet before sending: "Start a reading with [name]? $X/min · Your balance: [Stardust]" with Confirm/Cancel. This adds one calm, reversible step before money is involved.

**H2 — After requesting, the transition gives no explicit confirmation**
- **Severity:** Medium · **Type:** Improve
- **Evidence:** On success it silently pushes to the Sessions list (`psychics/[id].tsx:70`); the new item shows "Requested — waiting for [psychic]" (`sessions/index.tsx:29–31`).
- **What the user experiences:** The screen changes and it's not immediately obvious her request was sent and is now waiting.
- **Recommendation:** Show a brief confirmation ("Request sent — [name] will join shortly") on landing in Sessions, so the state change is unmistakable.

**H3 — Existing-chat and error handling are plain-language (positive)**
- **Severity:** Low · **Type:** (praise / keep)
- **Evidence:** `psychics/[id].tsx:77–102` — "You already have a chat" with an "Open it" action, and plain "Couldn't start reading. Please check your connection and try again." Good.

**H4 — "Start Reading" button on the card is a bit small**
- **Severity:** Low · **Type:** Improve
- **Evidence:** `PsychicCard.tsx:246–251` (button padding `10`/`16`, ~11px text). The whole card is also tappable, which mitigates it.
- **What the user experiences:** The button itself is a smallish tap target, though tapping anywhere on the card works.
- **Recommendation:** Increase button vertical padding slightly (to reach ~44px height) for confident tapping.

---

### I. Mobile app — Live session / chat
**File:** `tarot-app/app/sessions/[chatId].tsx`

**I1 — A requested-but-not-yet-accepted chat looks empty/idle**
- **Severity:** Medium · **Type:** Improve
- **Evidence:** The session bar, paused banner, and ended banner only render when `status === "ACTIVE"` (`181`, `210`, `215`); in the REQUESTED state the screen shows just an empty message list with "No messages yet. Say hello ✦" (`243–245`).
- **What the user experiences:** After requesting, she opens the conversation and sees an empty screen with no indication the psychic simply hasn't joined yet — it can look broken.
- **Recommendation:** Show a clear waiting banner in the REQUESTED state, e.g. "Waiting for [name] to accept your request — you'll get a message when they join."

**I2 — Live session bar is excellent (positive)**
- **Severity:** Low · **Type:** (praise / keep)
- **Evidence:** `181–222` — SESSION / REMAINING / BALANCE with the remaining time changing color under 5 min (gold) and 1 min (red) *while still showing the number and label*, a plain paused banner ("Reading paused — waiting for your reader to resume"), an ended banner, and a connection status dot **with** a text label (`155–160`). This is exactly the clarity this audience needs — keep it.

**I3 — End-session confirmation is clear (positive)**
- **Severity:** Low · **Type:** (praise / keep)
- **Evidence:** `107–130` — "End session? This ends the reading for you and the psychic." with Cancel/End. Good, forgiving of mistakes.

---

### J. Website — Live client chat
**File:** `tarot-landing-web/src/features/chat/views/ClientChat.tsx`

**J1 — "Insufficient balance" is technical language for session end**
- **Severity:** Medium · **Type:** Improve
- **Evidence:** End reasons are phrased as "Session ended - insufficient balance" (`262`, `306–307`); low-balance warnings are only `console.log` (`102–103`, `251–252`), not surfaced warmly to the user.
- **What the user experiences:** Her reading stops and she's told she had "insufficient balance" — cold wording at an emotional moment, with no gentle heads-up beforehand.
- **Recommendation:** Reword to something supportive and actionable, e.g. "Your reading time has run out. Add Stardust to keep going." and surface a friendly low-time warning (e.g. at ~1 minute left) with a one-tap "Add Stardust" button rather than only logging it.

---

### K. Cross-cutting — Contrast & low-opacity labels
**Files:** multiple (app `theme/colors.ts`; many `rgba(255,255,255,0.3–0.4)` labels)

**K1 — Many small labels use very low-opacity white**
- **Severity:** Medium · **Type:** Improve
- **Evidence:** e.g. app session labels `rgba(255,255,255,0.4)` at 9px (`sessions/[chatId].tsx:383`), preview note `rgba(255,255,255,0.4)` (`stardust.tsx:424`), web nav labels at `rgba(255,255,255,0.4)`. Brand text colors themselves (`#E6EDF3`, `#D2B9FF` on `#0B0B0B`) have good contrast; the risk is the faded whites at tiny sizes.
- **What the user experiences:** Section labels and helper notes fade into the dark background and are easy to miss.
- **Recommendation:** Raise small secondary text to at least ~55–60% opacity white (the app's `textMuted` is already 0.55 — apply that consistently and avoid 0.3–0.4 for anything users need to read).

**K2 — Color is generally backed by text/icons (positive)**
- **Severity:** Low · **Type:** (praise / keep)
- **Evidence:** Session/chat status uses a colored dot **plus** a text label (`sessions/index.tsx:173–183`); billing transactions use +/− and icons alongside green/red. No critical reliance on color alone was found.

---

## Prioritized punch list — top 10 (by impact on trust & ease for this audience)

1. **Rewrite the website sign-up copy** from sci-fi ("Join the Council," "neural profile," "AGENT_NAME_00," "Initialize Profile," "Authorized Login") to warm, plain language. *(register.tsx — Critical)*
2. **Add a visible Help / Support link** to the website nav + mobile drawer + app Profile, and make the billing "contact support" text a real link. *(Navbar.tsx, Billing.tsx — High)*
3. **Fix auth-form readability**: larger, sentence-case labels (~14px) and inputs (~16px), and legible placeholder text (raise from ~10% to ~40–50% opacity). *(register.tsx, verify-email.tsx, login — High)*
4. **Add a confirmation step before "Start Reading"** showing the per-minute rate and current balance, so no paid request is sent by surprise. *(psychics/[id].tsx — High)*
5. **Explain "Stardust" in one plain sentence** before purchase ($1 = 1 Stardust, spent per minute during readings). *(stardust.tsx, profile.tsx — High)*
6. **Show a "waiting for your reader to accept" banner** in the requested-but-not-active chat state so it never looks broken. *(sessions/[chatId].tsx — Medium)*
7. **Soften session-end wording** on the website to "Your reading time has run out — add Stardust to keep going," plus a friendly low-time warning with an Add-Stardust button. *(ClientChat.tsx — Medium)*
8. **Unify terminology** across web and app — one word for the reading conversation ("Sessions"/"Readings"), consistent "Stardust." *(Navbar.tsx vs app tabs — Medium)*
9. **Make sign-in easier to find on mobile** (clear entry beyond the Profile tab) and **add "Forgot password?"** to the app sign-in form. *(profile.tsx, sessions/index.tsx — Medium)*
10. **Raise low-opacity small labels** (from 0.3–0.4 to ~0.55+ white) and **calm the auth-page motion** (reduce parallax/pulsing, honor reduce-motion). *(theme + auth pages — Medium/Low)*

---

*End of report. No files other than this report were created or modified.*

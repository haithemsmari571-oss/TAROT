# Stardust Constellation — Gamified Profile & Daily Ritual System
**Ask Valentina — askvalentina.co.uk**
**Prepared: July 5, 2026**

The client profile becomes a daily destination: a personal "Constellation" page with a daily card pull, AI-generated rituals and manifestations, a task list that pays Stardust, and a referral engine. Every free interaction ends one tap away from a paid reading.

---

## 1. Core Concept & Positioning

**Ritual, not casino.** All mechanics are dressed in the brand's spiritual language. Nothing should read like a rewards app.

| Generic term | Ask Valentina term |
|---|---|
| Quest board / tasks | **Rituals** |
| Daily streak | **Your Practice** |
| Points balance | **Stardust** (existing currency) |
| Profile page | **Your Constellation** |
| Levels / badges | **Seeker → Initiate → Oracle's Circle** |
| Pending reward | "The stars are confirming your offering" |

**Strategic role:** This system is a *comeback engine* (daily pulls, streaks) and a *spread engine* (referrals, shares). It multiplies existing traffic — it does not create traffic on its own. Build the lean core first (Phase 1), expand once people are using it.

---

## 2. The Economy — Hard Rules (non-negotiable)

Stardust is pegged 1 ⭐ = $1 of reading value (matches the glider checkout spec). These rules protect the economics:

1. **Earned (free) Stardust covers a maximum of 50% of any order.** Purchased Stardust has no restriction. This makes every earned point a discount that *forces a purchase* — free points can never fully pay for a reading. Track earned vs. purchased Stardust as two separate balances under one displayed total.
2. **Earned Stardust expires 30 days after it is credited.** Creates urgency, caps liability. Show a soft warning at 7 days left: "Your Stardust is fading."
3. **All reward amounts are validated server-side.** The client never tells the server how much to credit — same principle as the glider's bonus-tier validation.
4. **Task availability is server-controlled**: 4 tasks visible per 5-hour rotation window, same task never pays the same user twice within 24 hours, one-time tasks once per account. All enforced server-side.
5. **Tasks and reward amounts are fully managed from the admin panel** (see Section 7). The server always reads the reward amount from the task record in the database at credit time — the client never sends an amount, and the Claude API never invents tasks or sets rewards. Admin is the single source of truth for the task pool.

---

## 3. The Constellation Page (profile redesign)

Layout top to bottom:

1. **Today's Card** — face-down card, tap to reveal. Shows the card art + Claude-generated interpretation for the user's zodiac sign. Below it, the daily upsell CTA: *"Today's card touches something specific in your situation. Ask Valentina what it means for you — $9."*
2. **Daily Ritual & Manifestation** — short Claude-generated section for the user's sign: one manifestation intention + one small ritual/reflection for the day.
3. **Your Practice (streak)** — current streak counter with a 7-day visual (stars filling in). Day-7 bonus highlighted.
4. **Rituals (rotating task strip)** — exactly **4 tasks visible at a time**, drawn from the eligible pool, **rotating every 5 hours** with a live countdown timer ("New rituals in 3h 12m"). Completed ones lit up, pending social claims shown as "confirming ✨". The countdown creates do-it-now urgency; the rotation keeps the profile feeling alive on every visit.
5. **Stardust balance** — total displayed with a breakdown on tap (purchased / earned / earned expiring soon). Balance animates upward with a starburst the moment a reward lands.
6. **Referral card** — personal link + "Gift a friend a free card pull from Valentina" framing, copy button, share buttons.
7. **Constellation progress** — Seeker → Initiate → Oracle's Circle path; stars light up as lifetime milestones are hit (first reading, 7-day streak, first referral, 3 readings, etc.). Cosmetic only — titles and visuals, no economic power.

Uses existing brand colors/fonts (see brand visuals spec). The gold-glow treatment from the Lifetime slider mode is reused for moments of celebration (streak bonus, tier-up).

---

## 4. Daily Content Engine (Claude API)

**Architecture:** one scheduled job (cron) runs nightly, generates the next day's content, stores it in the database. Pages read from the database — the API is never called on page load.

**What it generates, per zodiac sign (12 variants daily):**
- Daily card: which card + a 60–90 word interpretation in Valentina's voice
- Manifestation of the day (1–2 sentences, intention-setting)
- Daily ritual (one small, concrete act of reflection — light a candle, write one line, a breathing moment)
- One shareable quote line (used in the share image)

**Cost:** 12 calls/day with a small model (Claude Haiku) ≈ pennies per month.

**Voice & guardrails baked into the generation prompt:**
- Valentina's voice: intimate, direct, emotionally precise. No generic horoscope filler.
- Stay in the "reflection and intention" lane. **Never**: health advice, financial advice, "he will text you," guaranteed outcomes, or anything ASA-non-compliant. Same rules as ad copy (Part 14 of the master strategy).
- Every interpretation ends with an open loop that the paid CTA resolves ("what this card asks of *you* depends on what you're carrying into it").

**Fallback:** if the nightly job fails, serve yesterday's content rather than an empty section. Log the failure visibly for Logan.

---

## 5. The Task System (admin-managed skeleton)

The build is a **skeleton**: the code defines how tasks work, the admin panel defines what tasks exist. Logan creates, edits, prices, and retires tasks daily without touching code.

### Task model (every field editable in admin)

| Field | Options |
|---|---|
| Title + description | Free text (shown on the Constellation page) |
| Icon/emoji | Free choice |
| Reward | Any ⭐ amount, set per task |
| Verification type | **Auto** (system event) / **Screenshot** (manual approve) / **Handle/link** (manual approve) |
| Trigger event (auto tasks only) | Dropdown of detectable events: daily pull, reading rated, favourites picked, first purchase, purchase from Nth distinct reader, referral's first payment, streak milestone |
| Frequency | Once per account / once per day / once per rotation window / unlimited (24h guard still applies) |
| Status + schedule | Active/inactive, optional start & end date (for limited-time challenges) |
| Rotation weight | How often it appears in the 4-task strip |

**The one technical constraint:** manual tasks (screenshot/handle) can be *anything* — "comment your sign on today's reel," "duet the new TikTok" — invented freely, because Logan verifies them by eye. Auto tasks must bind to an event from the dropdown, because code has to detect completion. Adding a brand-new detectable event type is a code change; everything else is admin config.

**Rotation mechanic:** the Rituals strip shows **4 tasks at a time**, refreshed **every 5 hours** (server-side, per-user selection from active tasks that user is still eligible for — never show a one-time task they've already completed, never show "first reading bonus" to a paying client). A countdown timer to the next rotation is always visible. The rotation itself acts as the volume limit — there are no visible weekly caps. One silent server-side guard: **the same task cannot pay the same user twice within 24 hours**, so a task reappearing in the next window can't be double-claimed.

**Not in the rotation:** the daily card pull and the streak are permanent fixtures of the page, not rotating tasks.

**Birth details are not a rewarded task.** DOB (and partner DOB optionally) is collected at signup or as the gate before the first daily pull — the zodiac-based daily content requires it, and the pull itself is the incentive.

### Launch seed tasks

The tables below are the **starting content**, not hardcoded rules — every row is created through the admin panel and can be edited, re-priced, or deleted there.

**Tier 1 — Fully automatic (in-app events, credit instantly)**

| Task | Reward | Frequency | Verification |
|---|---|---|---|
| Daily card pull | **1–10 ⭐ random** ("the universe decides") | Daily (permanent) | Server event |
| 7-day practice streak | +10 ⭐ bonus | Weekly (permanent) | Server event |
| Choose your 3 favourite guides | 2 ⭐ | Once | Server event (3 favourites saved) |
| Complete a reading with 3 different guides | 10 ⭐ | Once | Payment records across 3 distinct readers |
| Rate your reading in-app | 2 ⭐ | Per reading | Server event |
| First reading bonus | +20% of purchase back in ⭐ | Once | Payment webhook |

The favourites + three-guides pair works together: picking favourites gets the client browsing reader profiles; the three-guides reward turns a one-psychic client into a three-psychic client through real purchases. The Constellation page shows the 3 favourites with a subtle progress marker ("You've sat with 1 of your 3 guides").

The random daily reward is deliberate: variable rewards are the strongest habit loop. Average payout ~3–4 ⭐/day; weight the distribution so 1–3 ⭐ is common and 10 ⭐ is rare.

**Tier 2 — Automatic via payment trail**

| Task | Reward | Verification |
|---|---|---|
| Refer a friend (friend makes first purchase) | 15 ⭐ to referrer | Stripe webhook fires on friend's first payment → credits automatically |
| Friend's welcome gift | Free mini-reading (one-card pull "gifted from your friend") — **not** points | Granted at signup via ref link |

The friend gets a product experience, not currency — a free gifted pull puts them straight into the product and converts far better than points they don't understand yet.

**Tier 3 — Social / creative challenges (claim queue, manual approve)**

| Task | Reward | Verification |
|---|---|---|
| Share daily card to IG story with @askvalentina tagged | 5 ⭐ | Tag appears in Logan's own IG notifications; user submits IG handle |
| Share/repost latest post | 3 ⭐ | Screenshot upload |
| Like + comment on latest post | 1 ⭐ | Honor system / screenshot, no deep review |

No visible caps — availability is governed by the 5-hour rotation plus the silent once-per-24h rule. Weight the rotation so social tasks appear less often than in-app tasks (e.g., at most 1–2 social tasks per window).

### Excluded on purpose
- **Trustpilot review reward — never.** Incentivized reviews violate Trustpilot guidelines and ASA rules; getting caught means deleted reviews and a public warning banner. Ask happy clients for Trustpilot reviews separately, with no reward attached.
- **"First hour on site" bonus** — rewards loitering, farmable, no marketing value.
- **Leaderboards** — nobody wants to be publicly ranked as top spender on a psychic site.
- **Comment-heavy tasks as a focus** — ten "🔥" comments do less than one tagged story.

---

## 6. The Claim System (the backbone)

Every task completion creates a **claim** record: `user, task, timestamp, evidence (optional), status, reward amount (from the fixed pool)`.

- **Auto tasks** (Tier 1 & 2): claim is created and approved in the same server action. Balance updates instantly, starburst animation fires.
- **Manual tasks** (screenshot/handle): claim is created as `pending`. User sees "The stars are confirming your offering ✨". Logan approves or rejects from the admin claims queue. Approve credits instantly (amount read from the task record at that moment) and notifies the user.
- Rejected claims show a gentle message and don't count against frequency caps.

This one mechanism means every new task Logan creates in admin — auto or manual — plugs into the same pipeline with zero extra code.

### 6.1 Screenshot upload pipeline (solve compression before launch)

The known failure mode: clients try to upload a 10–20MB phone screenshot/photo, the site rejects it or hangs, they give up. The fix is **automatic client-side compression** — the user never sees a size limit and never compresses anything themselves.

Flow:
1. User taps the task → sees clear instructions + an upload zone ("tap to add your screenshot").
2. **In the browser, before upload**, the image is processed (e.g., the `browser-image-compression` library or a canvas pipeline): downscaled to max ~1600px on the long edge, re-encoded as JPEG or WebP at ~80% quality. A 15MB photo becomes ~200–400KB.
3. Accept every input format — PNG, JPG, WebP, and **HEIC** (iPhone photos; convert client-side, e.g., `heic2any`). Accept files up to ~30MB *pre-compression* so nothing bounces.
4. Strip EXIF metadata during re-encode (privacy: screenshots can carry location data).
5. Show a thumbnail preview + progress bar; submitting creates the pending claim.
6. **Server-side fallback:** if a raw/oversized file arrives anyway (old browser, JS failure), compress on the server (e.g., `sharp`) instead of rejecting. Nothing a real user uploads should ever fail.
7. Store compressed images only; auto-delete evidence files ~60 days after the claim is resolved to keep storage tiny.

**Anti-abuse:**
- Task availability governed server-side by the 5-hour rotation + silent once-per-24h-per-task rule (Section 5). The client never decides which tasks are claimable.
- Referral self-dealing check: referrer and referee can't share a payment method/email domain trivially; at minimum, block same-email and flag same-card.
- New accounts can't submit social claims until they've done one daily pull (kills drive-by farming).
- Rate-limit claim submissions.

---

## 7. Admin Panel (the control room)

One protected admin area, four screens. This is what makes the whole system a skeleton Logan fills with daily creativity:

1. **Task Manager** — list of all tasks with status; create/edit form covering every field in the task model (Section 5); duplicate button ("copy yesterday's challenge, change the text"); activate/deactivate toggle; scheduling for limited-time challenges. Creating a fresh challenge should take under 60 seconds.
2. **Claims Queue** — pending claims with screenshot/handle preview inline, user info, task, submitted time. One-tap Approve / Reject (optional short rejection reason). Bulk-approve for batch review.
3. **Purchases & Flags** — the $1000 Lifetime purchase flag list (required by the glider spec) plus recent orders. Same page keeps admin minimal.
4. **Settings** — rotation interval (default 5h), tasks per window (default 4), earned-Stardust redemption cap (default 50%), earned-Stardust expiry (default 30 days), moon-event dates/multipliers.

Admin actions are authenticated and server-side only; no reward logic ever runs in the client.

---

## 8. Share Image Generator

When a user pulls their daily card, generate a branded shareable image server-side or client-side (canvas):

- Card artwork + card name
- One quote line from the day's Claude generation
- "Ask Valentina" wordmark + **askvalentina.co.uk** at the bottom
- Brand colors/fonts per the brand visuals spec

A "Share ✨" button downloads it / opens the native share sheet. This is the actual marketing payoff — engaged users producing branded content daily with the URL baked in. A screenshot of a webpage is not shareable; a beautiful card image is.

---

## 9. Moon Events (marketing calendar for free)

- **Full moon:** double Stardust on the daily pull ("The moon is full — the stars are generous tonight").
- **New moon:** special one-time pull + a new-moon manifestation ritual.
- Each event = one email to the list and one social post. Two on-brand touchpoints per month that aren't "buy something."
- Implementation: a simple events table with dates and multipliers; the daily-pull logic checks it.

---

## 10. "Ask the Void" (Phase 3 sleeper)

Users submit one anonymous love question for 2 ⭐. Logan answers the best ones as public posts/TikToks (anonymized). Endless feed of real content ideas in the audience's exact words; users get rewarded for handing over marketing material. Build only after Phases 1–2 are live and used.

---

## 11. Compliance Guardrails

- No incentivized Trustpilot/Google reviews, ever (Section 5).
- Generated daily content follows ASA rules: no guaranteed outcomes, no health/financial advice, "possible timing" language only.
- Social tasks reward *sharing your own result*, not astroturfed praise. Don't script what users must say.
- Earned-Stardust terms (50% cap, 30-day expiry) stated clearly on the Constellation page — hidden mechanics destroy trust.

---

## 12. Build Phases

### Phase 1 — The Skeleton (build first)
1. Task model + claim system backbone (Sections 5–6) — the spine everything plugs into
2. **Admin panel: Task Manager + Claims Queue** (Section 7) — without this nothing is changeable
3. Constellation page (new profile layout) with rotating 4-task strip + countdown
4. Daily card pull + random 1–10 ⭐ reward + streak counter (DOB gate before first pull)
5. Nightly Claude generation job (card, manifestation, ritual × 12 signs) + fallback
6. Dual balance (earned vs. purchased), 50% redemption cap, 30-day expiry
7. Screenshot upload pipeline with automatic client-side compression (Section 6.1)
8. Seed the launch tasks from Section 5 through the admin panel

### Phase 2 — Spread Mechanics
9. Referral link + Stripe-webhook credit + friend's gifted pull
10. First reading bonus + favourites picker + three-guides reward (auto-event tasks)
11. Share image generator + share button
12. Constellation progress path (Seeker → Initiate → Oracle's Circle)
13. Moon events (admin-scheduled multipliers) + matching email templates
14. Daily upsell CTA refinement + admin Settings screen

### Phase 3 — Depth (only once Phases 1–2 have real usage)
13. "Ask the Void" question submissions
14. Streak milestones beyond 7 days (30-day "Devoted" state)
15. Personalized (per-user, not per-sign) daily readings as a paid subscription hook

### Explicitly not building
- Leaderboards, public activity feeds
- Automated Instagram verification (not feasible; claim queue instead)
- Any Trustpilot reward integration

---

## 13. Success Metrics (check weekly, add to Monday report)

- Daily pull users (the new core engagement number)
- 7-day streak completion rate
- Share claims submitted / approved
- Referral link clicks → signups → first purchases
- % of purchases that used earned Stardust (proves the 50% mechanic is driving orders)
- Upsell CTA clicks from the daily card → checkout

---

## 14. Handoff Notes for Claude Code

- Repo: `github.com/haithemsmari571-oss/TAROT` — `TAROT-BACKEND` + `tarot-landing-web`
- Reuse the server-side validation pattern from the glider checkout for all reward crediting
- Currency stays USD / Stardust ($1 = 1 ⭐), per the locked glider spec
- The $1000 Lifetime flag list lives inside the same admin panel (Section 7, screen 3)
- **This spec supersedes the earlier "no admin panel" decision** — the task system is now fully admin-managed by design
- Nightly job needs an API key for Claude (Haiku model) stored server-side, never in frontend code
- Image compression: `browser-image-compression` + `heic2any` client-side, `sharp` as server fallback
- Start prompt for Phase 1: "Read stardust-gamification-plan.md and implement Phase 1 (Section 12). Sections 2, 5, 6 and 7 define the rules and the admin panel."

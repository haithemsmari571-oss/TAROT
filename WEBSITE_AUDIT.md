# Ask Valentina — Full‑Site Deep Audit

Read‑only diagnosis. No code was changed to produce this report. UI verdicts are
marked **[rendered]** when I actually loaded the page (mobile width, live site
`askvalentina.co.uk` or local stack) or **[code‑only]** when I could only read
the source. Where I could not verify something, it says so.

Finding format: `[SEVERITY: critical/major/minor/polish] [EFFORT: S/M/L] — finding — fix.`

Context held throughout: solo non‑technical owner; audience women 25–45, **almost
all on phones, many 40+**; brand = intimate/elegant/mystical (violet/gold,
"ritual not casino"); UK market, ASA rules on client copy; goal = first 100
paying clients.

---

# SECTION 1 — COMPLETE SITE MAP

## 1A. Client routes (what a member/visitor can reach)

| Route | Purpose | Auth | Notes |
|---|---|---|---|
| `/` | HomeRedirect → sends logged‑in USERs to `/psychics-browse`, guests to `/home` | public | pure redirect |
| `/home` | Marketing landing page | public | the funnel top |
| `/psychics-browse` | Grid of psychic readers + filters (search, categories, online‑only, price) | public | also the logged‑in client "home" |
| `/psychics/:id/details` | Single psychic profile + start‑reading CTA | public | |
| `/profile` | **The Constellation** (daily card, rituals strip, Stardust balance, streak) | requiresAuth | client's personal ritual home |
| `/billing` | Buy Stardust / top‑up | requiresAuth | money‑in |
| `/chats` | Client's reading sessions (the live chat) | requiresAuth | the product |
| `/notifications` | Client notification list | requiresAuth | |
| `/oracle` | **Unclear** — public "oracle" page | public | ⚠️ needs render to confirm purpose |
| `/about`, `/privacy`, `/terms` | Static legal/trust pages | public | ASA/trust surface |
| `/does-he-miss-me`, `/will-my-ex-come-back` | SEO landing pages (prerendered) | public | verified live 200 |
| `/login`, `/register`, `/forgot-password`, `/reset-password/:token`, `/verify-email/:token`, `/verify-account` | Auth flows | guest | |

## 1B. Admin/reader routes

| Route | Purpose | Allowed roles |
|---|---|---|
| `/admin/dashboard` | Admin/reader dashboard | PSYCHIC, ADMIN, SUPERADMIN |
| `/admin/chats`, `/admin/chats/:chatId` | Manage all reading sessions | PSYCHIC(list)/ADMIN/SUPERADMIN |
| `/admin/users` | User management | ADMIN, SUPERADMIN |
| `/admin/clients` | Client dossier | ADMIN, SUPERADMIN |
| `/admin/psychics` | Psychic management | ADMIN, SUPERADMIN |
| `/admin/reader-activity` | Reader earnings/activity | SUPERADMIN |
| `/admin/categories` | Category management | ADMIN, SUPERADMIN |
| `/admin/zodiac`, `/admin/lifepath` | Zodiac & life‑path content | ADMIN, SUPERADMIN |
| `/admin/buy-options` | Buy‑option (top‑up pack) management | ADMIN, SUPERADMIN |
| `/admin/landing` | Landing‑page editor | ADMIN, SUPERADMIN |
| `/admin/tasks`, `/admin/claims` | Rituals: task pool + claims queue | ADMIN, SUPERADMIN |
| `/admin/ledger` | Transaction ledger | ADMIN, SUPERADMIN |
| `/admin/notifications` | Send/notify | PSYCHIC, ADMIN, SUPERADMIN |
| `/admin/ai-prompts` | AI Prompt Registry | SUPERADMIN |
| `/admin/rituals-settings` | Economy + nightly content engine settings | SUPERADMIN |
| `/admin/settings` | General settings | SUPERADMIN |
| `/admin/my-reviews`, `/admin/my-profile` | Reader's own reviews/profile | PSYCHIC |
| `/admin/life-path` | → redirects to `/admin/lifepath` | (redirect) |

## 1C. Backend API surface (prefixes)
`/api/auth`, `/api/psychic`, `/api/category`, `/api/chat`, `/api/media`,
`/api/payment`, `/api/transactions`, `/api/admin/refunds`, `/api/admin` (users,
settings, transactions, psychics, dashboard, tasks/claims, ai‑prompts, content),
`/api/profile`, `/api/zodiac`, `/api/admin/zodiac`, `/api/reviews`,
`/api/notifications`, `/api` (landing, public settings, client dossier,
constellation). WebSocket for live sessions (separate).

## Section 1 findings — dead / orphaned / duplicated / structural

- **[SEVERITY: major] [EFFORT: S]** — `/admin/buy-options` manages "buy options" (top‑up packs), but the DB migrations `archive_buy_options` and `delete_stale_landing_buy_options` removed that feature; billing now appears to use a different top‑up path. **This admin screen is very likely dead/orphaned** and will confuse the owner. — Fix: confirm and hide the sidebar link + route, or repurpose it as the Stardust‑pack editor if packs are still sold. *(needs render to confirm what it shows now — flagged for Section 5.)*
- **[SEVERITY: minor] [EFFORT: S]** — Two separate settings screens for a solo owner: `/admin/settings` and `/admin/rituals-settings`. Split settings = the owner won't remember which screen holds which control. — Fix: merge into one Settings screen with sections, or cross‑link them clearly.
- **[SEVERITY: minor] [EFFORT: S]** — `/oracle` route exists and is public but its purpose is unclear from routing; if it's a half‑built feature it's an orphaned public page a visitor could stumble into. — Fix: confirm it's intentional and linked, or remove. *(needs render — Section 2.)*
- **[SEVERITY: minor] [EFFORT: S]** — Role gating is inconsistent: `/admin/dashboard`, `/admin/chats`, `/admin/notifications` admit PSYCHIC, but `/admin/reader-activity` (reader earnings) is SUPERADMIN‑only — a reader can't see their own activity page while seeing the dashboard. Given the platform is effectively solo‑owner (no real psychic logins?), the entire PSYCHIC‑role surface (`/admin/my-reviews`, `/admin/my-profile`, dashboard for PSYCHIC) may be dead weight. — Fix: confirm whether PSYCHIC logins exist in production; if not, this is a large unused surface to eventually prune.
- **[SEVERITY: minor] [EFFORT: S]** — `HomeRedirect` sends logged‑in clients to `/psychics-browse`, not to `/profile` (the Constellation). The gamified retention hub is therefore **not** the client's landing surface after login — they land on the "spend money" grid instead of the "come back daily" ritual. — Fix: consider landing returning clients on `/profile` (Constellation) to reinforce the daily habit (see Section 3/6).

*(Auth‑guard correctness per endpoint is analysed in Section 4.)*

---

# SECTION 2 — CLIENT UX CRITIQUE (mobile‑first)

**Tooling limitation (stated honestly):** the automated browser here could not be
forced to a true mobile viewport — `resize_window` is a no‑op (`innerWidth`
stayed 2048px). So layout‑pixel verdicts (exact tap‑target size, crowding at
360px) are inferred from the responsive CSS + desktop render and **should be
confirmed on a real phone**. Everything about **copy, tone, ASA, data quality,
dead‑ends, and empty states is viewport‑independent and was verified by rendering
the live site.** Pages rendered live: `/home`, `/psychics-browse`, `/profile`
(Constellation), `/login`.

## 2A. Landing / `/home` **[rendered live]**

- **[SEVERITY: critical] [EFFORT: M] — ASA compliance: the entire landing makes hard predictive/accuracy claims with no "entertainment" disclaimer.** Copy states as fact: "The month the call comes. The week the shift begins," "she speaks in soon," "the cards do not guess," "devastatingly accurate," "I tell you what he felt last Thursday." UK CAP/ASA rules require psychic/tarot marketing to be framed as **for entertainment** and forbid claims of factual accuracy or specific future prediction. — Fix: add a persistent, visible "For entertainment purposes only. 18+." line in the footer and near CTAs, and soften predictive claims to experiential language ("explore," "reflect on") — this must be **editable from admin**, not hardcoded.
- **[SEVERITY: critical] [EFFORT: S] — Health claims present.** Categories/skills include "HEALTH," "Reiki Healing," "Energy Healing," "Past Life Regression." ASA bans health/therapeutic claims for spiritual services. — Fix: remove or relabel health/healing skills; never imply treatment.
- **[SEVERITY: major] [EFFORT: S] — Real data‑quality bugs visible to clients on the live homepage:** reader **"TABITHA"** has the bio **"hello"**; reader **"MATT"** has a bio that is entirely about a man named **"John"** (name/bio mismatch). A first‑time visitor sees a "reader" with a one‑word bio and another whose story is about someone else → instant "this is fake/broken." — Fix: data cleanup + an admin validation that blocks publishing a reader with <N‑char bio or a name mismatch.
- **[SEVERITY: major] [EFFORT: M] — Likely fabricated testimonials + non‑existent product names.** Testimonials ("Aria Vance / SOUL SEEKER", "Julian Thorne", "Marcus K.") praise products that don't exist in the per‑minute chat product ("Two‑Fold Truth reading", "Deep Soul Access", "Whisper Message", "channeled card spread"). ASA requires testimonials to be genuine and held on file. — Fix: replace with real, attributable reviews (you already have a reviews system) or remove.
- **[SEVERITY: major] [EFFORT: M] — "NAME YOUR OFFERING" money slider (£15–£1000) with escalating bonus tiers (WHISPER +25%, REVELATION +40%, DEVOTION +60%, LIFETIME £1000) is on the cold‑traffic landing page.** Pushing a £1000 "offering" and "bigger spend = bigger bonus" to someone who hasn't had a single reading is (a) asking for large trust before any value and (b) the exact **casino mechanic** the brand says it rejects ("ritual not casino"). — Fix: move large top‑ups behind first‑reading value; lead with the £15 free credit only; reframe bonus tiers away from gambling language.
- **[SEVERITY: minor] [EFFORT: L] — Psychic bios are 500–800‑word walls of text** (Valentina's is ~800 words). Gorgeous writing, but on a phone this is an unreadable scroll and buries the CTA. — Fix: show a 1–2 line hook on cards + "Read more"; keep the long bio on the detail page.
- **[SEVERITY: minor] [EFFORT: S] — Narrative assumes a female reader ("Your psychic… she…") but sells male readers** (Yusuf, Jamie, Matt, Jamie). Small credibility crack. — Fix: neutral phrasing or per‑reader pronouns.
- **[SEVERITY: minor] [EFFORT: S] — All 12+ readers show "ONLINE / Available / INSTANT CONNECTION" simultaneously.** If these aren't genuinely live people, that's an authenticity/ASA risk and sets an expectation the product may not meet. — Fix: confirm the online model; show realistic availability.
- **[SEVERITY: polish] [EFFORT: S] — Button labels are ALL‑CAPS + wide letter‑spacing** ("MEET OUR READERS", "START READING"). Elegant, but lower legibility for 40+ eyes on a phone. — Fix: sentence case for body CTAs; reserve caps for tiny labels.

## 2B. `/psychics-browse` **[rendered live]**

- **[SEVERITY: minor] [EFFORT: S] — Icon‑only price/filter affordances + the "✓" apply button** (violet square with only a checkmark) violate the house rule against icon‑only buttons; a 45‑year‑old won't know the lone ✓ applies the price filter. — Fix: label it "Apply".
- **[SEVERITY: minor] [EFFORT: M] — Empty state is barren:** searching a name with no match shows a ghost icon + "No psychics found matching your criteria" and nothing else — a dead end. — Fix: add "Clear filters" + show all readers as fallback.
- **[SEVERITY: minor] [EFFORT: S] — "Online Only" toggle defaults on;** if readers ever go offline the grid could look empty. — Fix: sensible default + empty‑state fallback (above).

## 2C. `/profile` — the Constellation **[rendered live]**

- **[SEVERITY: major] [EFFORT: M] — The Constellation is NOT where clients land after login** (HomeRedirect → `/psychics-browse`); the daily‑return ritual hub is only reachable via the tiny "VIEW PROFILE" chip. The whole retention engine is semi‑hidden. — Fix: land returning clients here, or add a prominent "Your Constellation" nav item. *(also Section 1/3.)*
- **[SEVERITY: major] [EFFORT: S] — Empty state unknown/at‑risk for a brand‑new client [code‑informed]:** a zero‑history client has no pulled card, no streak, no earned Stardust. Need to confirm the first‑ever view is inviting, not blank. I could not render a fresh account (prod write‑guard + JWT rotation logged the test client out). — Fix: verify the first‑run Constellation on a real new account; ensure a warm "pull your first card" hero, not empty rows.
- **[SEVERITY: minor] [EFFORT: S] — Celebration overlay is once‑per‑day and I couldn't re‑trigger it live** (the test account had already pulled → card "The Hermit" shown with "The stars gave you 1 ⭐"). Real WebP artwork renders correctly. — Verify the celebration animation on a fresh daily pull on a phone.

## 2D. `/login` + `/register` **[login rendered live]**

- **[SEVERITY: minor] [EFFORT: S] — Browser autofills a saved dev/client login into the form** (seen: `user@tarot.com`, then `jawemo8925@icotz.com`), which can silently sign a user into the wrong account. — Fix: (already partially addressed via input semantics) confirm on real devices; consider not persisting on shared machines.
- **[SEVERITY: minor] [EFFORT: S] — Right‑half of the login screen is a large decorative image** doing nothing on mobile (hidden `lg:block`) — fine on phone, but verify it's not consuming first paint.

## 2E. Cross‑cutting

- **[SEVERITY: major] [EFFORT: S] — No visible "18+ / entertainment only / terms" near the point of signup or payment** (ASA + trust). — Fix: add compact trust line at signup and checkout, editable from admin.
- **[SEVERITY: minor] [EFFORT: S] — `/oracle` public route purpose unconfirmed** — could not positively identify it as a linked, finished feature. — Fix: confirm intent; remove if orphaned.

---

# SECTION 3 — FUNNEL CRITIQUE (walking the money path as a stranger)

Friction rated 1 (frictionless) → 5 (drop‑off risk).

### Step 1 — Land on `/home` — **Friction 3**
Strong: the £15‑free hook is everywhere; the copy is genuinely gripping and
on‑brand; readers look premium. Friction: (a) it's a very long scroll of dense,
predictive copy before a clear "what do I do first"; (b) the £15–£1000 "offering"
slider with bonus tiers appears **before any value is given** — a cold visitor is
asked to consider £1000; (c) no trust/entertainment/18+ line to reassure a
cautious 40‑something. — Fix: one dominant CTA above the fold ("Start with £15 free
— no card needed" if true), defer big top‑ups, add a trust line.

### Step 2 — Signup `/register` — **Friction 4 [code‑informed]**
Registration collects **date of birth as mandatory** (needed for zodiac). Asking
DOB up front, before any value, is a known conversion killer for this demographic
("why do they need my birthday?"). Also email verification likely gates first use.
— Fix: explain *why* DOB is needed in one line ("so your daily card is read for
your sign"), or defer DOB to the first Constellation moment; confirm whether email
verification blocks the first reading (if so, that's a hard drop‑off point).

### Step 3 — First Constellation — **Friction 4**
The retention hub is **not** where the user lands (they're sent to
`/psychics-browse`). A brand‑new client may never see their Constellation, the
daily card, or the "£15 free" ritual framing on day one. The single biggest
day‑1→day‑2 retention asset is semi‑hidden behind a "VIEW PROFILE" chip. — Fix:
route first‑time/returning clients through the Constellation, or hard‑surface it.

### Step 4 — Browse `/psychics-browse` — **Friction 3**
Strong: rich, distinct reader personalities. Friction: (a) bios are 500–800‑word
walls → decision paralysis on a phone; (b) **trust‑breaking data bugs** live right
now (reader "Tabitha" bio = "hello"; "Matt" bio is about "John"); (c) every reader
"ONLINE" at once can read as fake. — Fix: short hooks + "read more", fix the data,
realistic presence.

### Step 5 — Start a reading — **Friction 4 [code‑informed; could not run a live billed session]**
Per‑minute pricing (£1.40–£5.20/min) with a **live countdown** turns a "ritual"
into a metered taxi — anxiety the brand explicitly wants to avoid. The first
minute is charged upfront on join; a client who can't cover one minute is blocked
at the door with a £‑amount error. — Fix: frame the free £15 as "X minutes on us,"
show the meter gently, and make the "not enough for one minute" message warm and
actionable (→ top‑up), not a red wall.

### Step 6 — Run out of balance (grace/pause) — **Friction 3 [code‑informed]**
Reasonably designed: a 60s GRACE pause with a "Session paused — client is out of
Stardust. Waiting for a top‑up" system line, extendable to 5 min once a top‑up
starts. Good that it pauses instead of hard‑ending. Risk: the pause happens
mid‑emotional‑moment and the top‑up UI must be instant and calm, or the client
leaves. — Fix: verify the pause→top‑up→resume flow on a phone end‑to‑end (I could
not run it live).

### Step 7 — Top up (the "offering" slider) — **Friction 4**
The £15–£1000 slider with escalating bonus % ("DEVOTION +60%", "LIFETIME £1000")
is a casino‑style upsell — and it appears **while the client is mid‑reading and
time‑pressured** (worst possible moment for a high‑pressure spend ladder). This
risks buyer's remorse, chargebacks, and is off‑brand. — Fix: for in‑session
top‑ups, show 2–3 calm, small "add minutes" options; keep the big‑tier ladder out
of the emotional moment.

### Step 8 — Return next day — **Friction 2**
Good bones: daily card + streak + earned Stardust is a real habit loop, and the
"fades in 30 days" nudge (now live) adds gentle urgency. Weakened only by Step 3
(the hub isn't the landing surface) and by no push/email reminder to come back. —
Fix: land them on the Constellation; add an opt‑in "your card is ready" reminder.

**Funnel summary:** the copy and art are a genuine strength; the leaks are
(1) asking for big money/DOB/trust before delivering any value, (2) the retention
hub being hidden, (3) live data‑quality bugs that scream "fake," and (4) a
casino‑style top‑up ladder that fights the "ritual" brand. None are deep‑tech —
all are copy/config/routing fixes an owner can drive if they're made editable.

---

# SECTION 4 — CODE & LOGIC PATTERNS

## What's genuinely solid (say it plainly)
- **Authorization is well‑structured [code‑verified].** Admin routers apply
  `require_permission(...)` at the router level (all endpoints covered); client
  endpoints use `get_current_user`. No obviously unguarded admin/client route found.
- **Money‑in is secure [code‑verified].** The Stripe `/webhook` verifies the
  signature (`stripe.Webhook.construct_event`) and credits via an idempotency key
  → duplicate webhooks can't double‑credit.
- **Billing penny‑exactness + spend order [test‑verified this session].** Per‑minute
  debit splits earned→credit→paid to the penny; 16 unit tests cover the four
  reader rates; earned=0 is byte‑identical to the old path.

## Real risks
- **[SEVERITY: critical] [EFFORT: M] — 11.8 MB `Cover.png` ships to the landing/login pages [build‑verified].** The production build emits `Cover-DKflHc5S.png = 11,893 kB`. On a phone on mobile data this is a multi‑second blank/slow first paint — for an audience that is *almost all on phones*, this alone can sink conversion and SEO. Main JS bundle is also 1.6 MB (456 KB gzipped) + a 1.35 MB `heic2any` chunk loaded app‑wide. — Fix: compress/replace Cover with an optimized WebP (<300 KB), lazy‑load `heic2any` only where photo upload happens, code‑split the bundle.
- **[SEVERITY: major] [EFFORT: S] — N+1 query on the admin ledger [code‑verified].** `get_all_transactions()` loops over transactions and runs a separate `db.query(User)…first()` per row. With a busy ledger the ledger page gets slow and hammers the DB. — Fix: join users once (or `selectinload`).
- **[SEVERITY: major] [EFFORT: S] — Hardcoded SMTP password in committed source [code‑verified].** `config.py` ships a real‑looking `MAIL_PASSWORD` default in git history. Even though prod overrides via `.env`, the secret is in the repo. — Fix: remove the default, rotate that mailbox password, load only from env.
- **[SEVERITY: major] [EFFORT: S] — CORS `allow_origins=["*"]` [code‑verified].** The API accepts cross‑origin calls from anywhere. Fine because the frontend uses no cookies, but it's needlessly permissive. — Fix: restrict to the known origin(s).
- **[SEVERITY: major] [EFFORT: M] — Session state lives in one process's memory (`active_sessions` dict) [code‑verified].** The live‑billing meter, grace timers and per‑minute charge counter are in‑memory in `session_manager`. This works on the current single‑container VPS, but (a) it's a hard ceiling — you can never run 2 backend replicas without sessions breaking, and (b) a mid‑session crash relies on `_recover_active_sessions` *estimating* `minutes_charged` from elapsed time, which can off‑by‑one a charge at the minute boundary. — Fix: keep as‑is for now but document the single‑replica constraint; longer term move session state to the DB/Redis.
- **[SEVERITY: major] [EFFORT: M] — Task trigger events are defined but never dispatched [code‑verified this session].** Enum `tasktriggerevent` has READING_RATED, FIRST_PURCHASE, PURCHASE_DISTINCT_READER, REFERRAL_FIRST_PAYMENT, STREAK_MILESTONE — but no code calls `create_claim` for these. Any task the owner configures with those triggers **can never be earned** (silent dead config). — Fix: either wire the dispatchers or hide those trigger options in admin until they're live (so the owner can't create impossible tasks).
- **[SEVERITY: minor] [EFFORT: S] — Two parallel billing paths [code‑verified].** The legacy interval biller (`billing.py`/`billing_task`) and the per‑minute engine (`session_manager`) both exist; double‑charging is prevented only by the `is_billed=True` flag set at interval creation. It works but is fragile — a future change to either path risks double‑ or under‑charging. — Fix: consolidate to one billing path.
- **[SEVERITY: minor] [EFFORT: S] — Per‑minute DEBIT has no idempotency key [code‑verified].** Unlike credits, debits rely on `interval.is_billed` + the in‑memory minute counter rather than a unique key. Under the recovery path (above) a boundary minute could theoretically be re‑charged. — Fix: add a deterministic idempotency key per (session, minute).
- **[SEVERITY: minor] [EFFORT: S] — Dead code:** `redeem_earned_stardust` (the old 50%‑cap redemption) is now unused after the equal‑value change; the `/admin/buy-options` feature is archived in DB but the code/route remain. — Fix: remove to reduce confusion.
- **[SEVERITY: minor] [EFFORT: S] — Mixed error patterns [code‑verified].** Most domain errors flow through the central `DomainError` handler, but `chats.py` hand‑rolls `JSONResponse(status_code=400/402,…)`. Inconsistent shapes make the frontend's error handling brittle. — Fix: standardize on the domain‑error path.
- **[SEVERITY: minor] [EFFORT: S] — AI content + expiry run in a single in‑process thread [code‑verified].** Fine for one VPS; note it won't fire if the process is down at 03:00 UTC and there's no external scheduler/alert if a nightly run fails. — Fix: surface last‑run failures in admin (partially done) + an alert.

---

# SECTION 5 — ADMIN PANEL AUDIT

Basis: `/admin/ai-prompts`, `/admin/rituals-settings`, `/admin/tasks`,
`/admin/claims`, `/admin/users` rendered live earlier this session; the rest
assessed from routes + backend settings code. Superadmin session confirmed live.

## What the owner CAN control (good)
- Signup/welcome credit amount (`signup_bonus` setting), unit price
  (`unit_price_cents` setting), AI prompts (full registry + versions + test),
  rituals economy (rotation window, tasks/window, earned cap, earned expiry),
  nightly engine (Generate now, last‑run), zodiac/life‑path content, categories,
  psychics (incl. their price + bio), landing content (partial), tasks/claims.

## What the owner CANNOT control but SHOULD (rule violations)
- **[SEVERITY: major] [EFFORT: M] — Stardust bonus tiers & pricing are hardcoded in `app/services/stardust.py` [code‑verified].** The `/stardust-tiers` endpoint says outright: *"Editing happens in code, not here."* So the owner cannot change the bonus percentages (WHISPER +25% / REVELATION +40% / DEVOTION +60%), the tier names, the £15/£1000 bounds, or the "£X = Y minutes" mapping without a developer. This is the single biggest violation of the platform's own "everything editable from admin" rule, and it's on the money‑making surface. — Fix: move tiers to settings + an admin "Pricing & Bonuses" editor.
- **[SEVERITY: major] [EFFORT: S] — No admin control for the (missing) ASA/legal disclaimer.** There is nowhere to set the "for entertainment / 18+" line that the client pages legally need. — Fix: add editable legal‑line + footer text in admin (ties to Section 2 criticals).
- **[SEVERITY: minor] [EFFORT: S] — Nightly content model + run hour are env‑only.** `CONTENT_MODEL` and `CONTENT_JOB_HOUR_UTC` require editing server env, not admin. The Rituals Settings screen shows the schedule but can't change the hour or model. — Fix: surface both as settings.
- **[SEVERITY: minor] [EFFORT: M] — Landing‑page long copy editability unconfirmed.** The homepage's five‑section narrative + testimonials drive the whole funnel; a prior commit ("reconcile landing editor with what the home renders") suggests drift. If the owner can't edit those sections/testimonials from `/admin/landing`, the ASA fixes require code. — Fix: confirm the landing editor covers every client‑visible block incl. testimonials and the offering‑slider copy.

## Workflow / safety‑rail gaps
- **[SEVERITY: major] [EFFORT: S] — Currency unit confusion in the money engine [code‑verified].** Pricing uses `unit_price_cents` and `app/services/stardust.py` comments in **US dollars ("$15 – $99")**, while the product sells in **GBP (£)**. An owner editing a "cents" field for a £ product, plus $ references in the pricing code, is a real mis‑pricing hazard. — Fix: make all money admin‑facing in £, rename the setting, purge $ references.
- **[SEVERITY: major] [EFFORT: S] — Reader price is set per SECOND, not per minute [code‑verified].** The owner edits `price_per_second` (e.g. 0.0867 for £5.20/min). A non‑technical owner will get this wrong. — Fix: admin field in £/minute, convert under the hood.
- **[SEVERITY: minor] [EFFORT: S] — `/admin/buy-options` is a dead screen** (feature archived in DB) still in the sidebar → owner confusion. — Fix: remove.
- **[SEVERITY: minor] [EFFORT: S] — Settings split across `/admin/settings` and `/admin/rituals-settings`** with no cross‑link. — Fix: unify or link.
- **[SEVERITY: minor] [EFFORT: M] — Claims queue likely lacks bulk approve/reject [needs confirm].** For 100 clients doing daily share‑tasks, approving one screenshot at a time will not scale. — Fix: multi‑select + bulk approve/reject with one confirm.
- **[SEVERITY: minor] [EFFORT: S] — Confirmations on destructive admin actions unconfirmed** (delete task/user/category). — Fix: verify a "type to confirm" or modal exists on every delete; add where missing.
- **[SEVERITY: minor] [EFFORT: S] — The data‑quality bugs (Tabitha "hello", Matt/John) ARE fixable in admin** (per‑psychic bio field) — so this is an owner content task, not code, but admin should warn on absurdly short bios. — Fix: min‑length validation on publish.

## Jargon check
- Brand terms (Constellation, Stardust, Rituals) are intentional and fine.
  Remaining jargon is "buy‑options" (dead) and the `price_per_second` /
  `unit_price_cents` internals leaking into owner‑facing edits.

---

# SECTION 6 — IDEAS (ranked by impact‑for‑effort, grounded in observations)

## (a) Client experience & retention
1. **[S] Land returning clients on the Constellation, not the browse grid.** Observed: `HomeRedirect`→`/psychics-browse`. The daily‑card/streak loop is the retention engine — make it the front door.
2. **[S] Tie the "Stardust fades in 30 days" nudge to a "use it on a reading" CTA.** Observed: the nudge exists but dead‑ends; convert urgency into a session.
3. **[M] "Your card is ready" opt‑in reminder (email/push).** Observed: no return‑reminder anywhere; the whole habit loop depends on the client remembering to come back.
4. **[S] Warm first‑run Constellation for zero‑history clients** ("Pull your first card ✨") instead of empty rows. Observed: couldn't confirm the new‑user empty state — de‑risk it.
5. **[M] Reader cards: 1–2 line hook + "Read more".** Observed: 500–800‑word bios are unreadable on a phone and bury the CTA.
6. **[M] Actually award streak milestones.** Observed: `STREAK_MILESTONE` trigger exists but nothing fires it — a promised reward that never arrives erodes trust.

## (b) Conversion to first paid reading
7. **[S] One hero CTA: "£15 free — X minutes with a reader," defer the £1000 slider.** Observed: cold landing asks for up to £1000 before any value.
8. **[S] Fix the trust‑breaking data bugs (Tabitha "hello", Matt/John).** Observed live — cheapest credibility win on the site.
9. **[S/M] Replace fabricated testimonials with real reviews** from the existing reviews system. Observed: testimonials cite products that don't exist.
10. **[S] Add a visible trust line ("For entertainment · 18+ · UK‑based")** near CTAs. Observed: cautious 40+ audience, nothing reassures them before signup.
11. **[S] Explain or defer the DOB ask at signup.** Observed: DOB mandatory up front — justify it ("so your daily card is read for your sign") or move it into the Constellation moment.
12. **[S] Turn "not enough for one minute" into a one‑tap top‑up,** warm copy, not a red £ wall. Observed in code (402/error path).
13. **[M] Calm in‑session top‑up (2–3 "add minutes" chips)** instead of the bonus ladder mid‑reading. Observed: casino ladder at the worst emotional moment → remorse/chargeback risk.

## (c) Admin power tools
14. **[M] "Pricing & Bonuses" admin editor** (move hardcoded tiers → settings). Observed: tiers hardcoded ("editing happens in code"). Biggest owner‑autonomy unlock.
15. **[S] Reader price in £/minute + £ everywhere** (hide `price_per_second`/`cents`). Observed: per‑second + cents/$ internals leak to the owner.
16. **[M] Bulk approve/reject + photo preview on the claims queue.** Observed: rituals depend on screenshot approvals; one‑at‑a‑time won't survive 100 clients.
17. **[S] Make nightly content hour + model editable in admin.** Observed: env‑only today.
18. **[M] "Publish checklist" validation** (min bio length, name↔bio match, disclaimer present) so fake‑looking data can't go live. Observed: the live data bugs.
19. **[S] Alert the owner if a nightly content run fails.** Observed: in‑process job; failures are silent beyond the admin panel.

---

# TOP 10 QUICK WINS (high impact, small effort)
1. **Fix the Tabitha "hello" / Matt‑"John" bios** — a live "this is fake" signal on the homepage; pure content fix.
2. **Add a "For entertainment only · 18+" trust line** near CTAs/footer — closes the biggest ASA gap and reassures the audience.
3. **Compress the 11.8 MB `Cover.png`** — the single worst mobile‑speed problem for a phone‑first audience.
4. **Land returning clients on the Constellation** — surfaces the whole retention loop with one routing change.
5. **Lead with "£15 free," defer the £1000 offering slider** on cold traffic — value before ask.
6. **Replace fabricated testimonials with real reviews** — genuine social proof, removes an ASA liability.
7. **Label the icon‑only ✓ filter button "Apply"** — removes a small but real confusion for 40+ users.
8. **Remove the dead `/admin/buy-options` screen** — declutters the owner's panel.
9. **Explain the DOB ask at signup** — recovers a classic signup drop‑off.
10. **Warm up the "not enough for one minute" message** into a one‑tap top‑up — turns a dead end into revenue.

# TOP 5 STRATEGIC PRIORITIES
1. **ASA/legal compliance pass** — soften predictive/accuracy claims, drop health/healing claims, add disclaimers, make it all editable. *Why: unaddressed, this is a legal/existential risk to the whole business, not a UX nitpick.*
2. **Move pricing & bonuses out of code into admin** — *Why: the owner cannot currently change the core money surface without a developer, which breaks the platform's own promise and slows every experiment.*
3. **Mobile performance pass (images + JS bundle)** — *Why: the audience is almost entirely on phones; an 11.8 MB image + 1.6 MB bundle costs conversions and SEO before a word is read.*
4. **Make the Constellation the retention centrepiece** (landing + reminders + wire the earn/streak triggers) — *Why: day‑2 return is the cheapest growth lever you have and it's currently hidden and half‑wired.*
5. **De‑casino the money moments** (top‑up ladder, bonus language, mid‑session pressure) — *Why: it directly contradicts the "ritual not casino" brand and invites remorse/chargebacks that will hurt a young Stripe account.*

---
*End of audit. Read‑only: no application code was modified. Items marked
"[needs confirm]" or "[code‑informed]" should be verified on a real phone /
fresh account before shipping fixes.*

---

## SECTION 2 ADDENDUM — Desktop/Mobile navigation PARITY (permanent check)

**This class of bug must be checked on every release.** Desktop and mobile
navigation are built from *different* markup in `Navbar.tsx` (a `hidden lg:flex`
desktop cluster vs a separate mobile drawer), so a link added to one is silently
missing from the other. Because the audience is almost entirely on phones, a page
that's only in the desktop cluster is effectively unreachable for real users.

- **[SEVERITY: critical] [EFFORT: S] — FIXED this pass:** the **Constellation
  (`/profile`)** and **Notifications (`/notifications`)** were reachable on desktop
  (profile button + bell) but **absent from the mobile drawer** — the daily‑habit
  flagship page was unreachable on phones. Fix shipped: "Your Constellation" is now
  the first drawer item (star icon); Notifications added; both header + drawer
  Stardust pills tap through to the Constellation balance; drawer footer is now
  auth‑aware (guests get Login / "Get £15 Free" instead of a nonsensical "Sign
  Out"); "View profile" renamed to "Your Constellation" everywhere.
- **Permanent rule for Section 2 reviews:** every client‑reachable route must be
  reachable from BOTH the desktop header and the mobile drawer (or intentionally
  neither). Before any release, open the mobile drawer and confirm it lists the
  same destinations as the desktop header for the current auth state. Best long‑term
  fix: drive both navs from a single shared `navItems` array (incl. Constellation +
  Notifications + auth‑aware account actions) so they can never drift again.

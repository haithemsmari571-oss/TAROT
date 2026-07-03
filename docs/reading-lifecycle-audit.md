# Reading Lifecycle Audit (Phase 0 — read-only discovery)

How the full reading lifecycle actually works **today**, traced across
`tarot-landing-web/` (client + psychic/admin web) and `TAROT-BACKEND/`.
No code was changed. File references use `path:line`.

**Severity legend:** `broken` = incorrect/loses money/dead-ends · `confusing` =
works but a reasonable user would be lost or surprised · `cosmetic` = polish.

**Key actors & routed screens**
- Client chat: `tarot-landing-web/src/features/chat/views/ClientChat.tsx` → route `/chats` (`src/routes/chat.routes.ts:24`).
- Psychic/admin console (accept happens here): `tarot-landing-web/src/features/chat/views/PsychicSessionGlass.tsx` → route `/admin/chats` (`chat.routes.ts:10`, roles PSYCHIC/ADMIN/SUPERADMIN). `views/index.ts:1` maps `PsychicSessionPage` → **PsychicSessionGlass** (not `PsychicSession.tsx`).
- Admin single-chat detail: `AdminChatDetail.tsx` → `/admin/chats/:chatId` (ADMIN/SUPERADMIN) — **can only END, not accept** (`AdminChatDetail.tsx:32`).
- Backend chat routes: `TAROT-BACKEND/app/routers/chats.py`. Session mechanics: `app/services/session_manager.py`. Notifications: `app/notification_manager.py`.

---

## 1. Browse — client views a psychic's profile
**Current behavior**
- Profile page `src/features/browse/views/PsychicDetails.tsx`. Primary CTA "Start Reading" (`:494`) calls `handleRequest` (`:85`) → if not logged in, `navigate("/login")` (`:80`); otherwise `requestChat({...})` (`:87`) then `navigate("/chats")` (`:96`).
- Psychic data comes from `GET /psychic/{id}` (`chatApi.getPsychicDetails`).

**Gaps**
- The CTA "Start Reading" actually sends a *request* (not an instant reading) and there's no cost/expectation confirmation before firing it. A first-time user taps expecting to start and instead silently commits to a pending request. **confusing**
- No visible rate/"you'll be charged $X/min" or balance check on the profile before requesting. **confusing**

---

## 2. Request — client requests a reading
**Current behavior**
- `requestChat` → `POST /chat/request` (`chatApi.ts:81`).
- Backend `chats.py:50` `requset_chat_endpoint` (note: typo in function name):
  - Blocks psychics (`:58`); blocks non-admin clients who already have an ACTIVE/PAUSED chat, returning `existing_chat_id` (`:65-82`).
  - Creates the chat (`req_start_chat`, `:85`), registers it with the session manager (`register_request`, `:90`).
  - Notifies the **psychic + all admins/superadmins** — DB `Notification` rows (`:111-135`) **and** real-time WS (`:138-159`), type `CHAT_REQUESTED`.
  - Returns `201` with **no body** (`:161`).
- Client feedback: `useRequestChat` invalidates the `chats` query (`useChatMutations.ts:12-16`); `PsychicDetails`/`ClientChat` show a success toast and the chat appears as `REQUESTED` ("Waiting for Psychic").

**Gaps**
- The request response is an empty `201` — the client never gets the new `chat_id` back, so the UI can't deep-link the client to the just-created request; it relies on a list refetch + manual find. **confusing**
- If the WebSocket send to the psychic fails, it's fire-and-forget (`send_to_user`) — the DB notification persists but there's no delivery guarantee/retry and no surfaced error. **confusing** (silent failure)
- Concurrency: the "one active/paused chat" guard only checks the *client* side here; the matching psychic-side guard lives in the accept path (see stage 3), so two clients can both hold REQUESTED chats to the same psychic with no queueing. **confusing**

---

## 3. Accept — psychic accepts via the console
**Current behavior**
- Real trigger: `PsychicSessionGlass.tsx:601` `handleAcceptChat` → `updateChatStatus(chatId, { status: "ACTIVE" })` → `POST /chat/{id}/status` (`chatApi.ts:159`).
- Backend `chats.py:418` `update_chat_status_endpoint`, ACTIVE branch (`:450`):
  - Only the assigned psychic or an admin may accept (`:451-458`).
  - Non-admin psychics blocked if they already have an ACTIVE/PAUSED chat (`:461-479`).
  - **Starts the session**: `session_manager.start_session(chat_id)` (`:483`) — this sets the timer `started_at = datetime.now()` at **accept time** (`session_manager.py:249,305,334`), with `client_joined_at=None`, `awaiting_join=True`.
  - Notifies **only the client** (`CHAT_ACCEPTED`, DB `:493-508` + WS `:511-527`) with `psychic_rate_per_second`, `client_balance`, `session_started_at`.

**Gaps**
- **Dead/duplicate psychic-side code that can mislead a developer:** `PsychicSession.tsx` (has its own `handleAcceptChat`) and `PsychicRequestTable.tsx` are **orphans — not routed anywhere**. `PsychicRequestTable.tsx:10-12` even ships **hardcoded fake requests** ("Sarah Miller", "James Chen", "Anna Belle"). The only live accept surface is `PsychicSessionGlass`. **broken** (dead code presenting as real)
- **Admins can't accept from the admin chat detail page** (`AdminChatDetail.tsx` only ENDs, `:32`); they must use the shared `/admin/chats` list. Not discoverable. **confusing**
- **The timer starts the instant the psychic accepts** even though the client may not be present yet (see stage 5 — this is the central problem). **broken**

---

## 4. Notify — what fires on each side
**Current behavior**
| Event | Client gets | Psychic gets | Admins get |
|---|---|---|---|
| Request | — | `CHAT_REQUESTED` (DB+WS) | `CHAT_REQUESTED` (DB+WS) |
| Accept | `CHAT_ACCEPTED` (DB+WS) | — | — |
| Decline/cancel | the *other* party gets `CHAT_REQUEST_CANCELLED` (`chats.py:555-599` or `:730-756`) | same | — |
| End | `CHAT_ENDED` (DB+WS, `:625-674`) | `CHAT_ENDED` (DB+WS, `:640-677`) | — |

- Client consumes these in `useChatSessionState.ts` via `useNotifications().onNotification` (`:287,358`): `CHAT_ACCEPTED` → dispatch `CHAT_ACCEPTED` + `onSessionAccepted()` (`:361-362`), plus `CHAT_PAUSED`/`CHAT_ENDED` handlers (`:372,408`).
- Bell: `NotificationBell.tsx:18-20` navigates to `/notifications` (or `/admin/notifications`) — **not to the chat**.
- Notifications list: `NotificationsPage.tsx:99` — clicking a chat notification does `navigate("/chats")` (the **list**, not the specific chat; no auto-select).

**Gaps**
- **No deep-link to the live chat on accept.** The `CHAT_ACCEPTED` handler only flips the chat to ACTIVE if the client already has that chat open (i.e. `useChatSessionState` is mounted with that `chatId`). If they're anywhere else, their only path is: bell → `/notifications` → click → `/chats` list → hunt for the chat → open it. `ClientChat` deliberately does **not** auto-select a chat. **broken** (dead-endy; compounds stage 5)
- **Accept notifies only the client; the psychic who accepted gets no confirmation event** — fine for the actor, but there is **no "client has joined" signal back to the psychic** at all, so the psychic can't tell whether the client is actually present (especially on web, which never joins — stage 5). **confusing**
- **Copy drift:** accept DB message "Your chat request has been accepted!" (`chats.py:497`) vs WS message "{psychic} accepted the chat request!" (`:515`) — same event, two strings. **cosmetic**
- No notification is sent to admins on accept/end, so an admin monitoring can't follow the lifecycle from the bell. **cosmetic**

---

## 5. Session start — timer, chat becomes live
**Current behavior**
- Timer is started at **accept** (`start_session`, stage 3).
- Intended re-anchor: `POST /chat/{id}/join` → `session_manager.mark_client_joined` (`chats.py:1170`, `session_manager.py:384`) re-sets `started_at`/`interval.started_at`/`chat.client_joined_at` to the join moment; its own docstring says "the timer does not run between accept and join" (`chats.py:1177-1179`).
- When the client opens the chat, `useChatFacade` connects the WS; backend on-connect sends a **read-only** `session_info` snapshot (`chats.py:1412-1441`) and `useChatSessionState` also pulls session time via REST. Client timer/`ClientChat` session bar initialize from that.

**Gaps**
- **THE WEB CLIENT NEVER CALLS `/join`.** There is no join function in `chatApi.ts` and no caller anywhere in `src/features/chat` (only `/topup`, `/pause`, `/resume` exist). The WS-connect handler only *reads* session info (`chats.py:1412-1441`) — it does **not** call `mark_client_joined`. Only the **mobile app** anchors on join. Result on the website: **the billing clock runs from the moment of accept, not from when the client actually opens the reading.** If the psychic accepts and the client opens the chat 5 minutes later, they arrive to ~5:00 already elapsed and ~5 minutes of Stardust already spent with zero conversation. **broken** (real money lost; also the #1 platform inconsistency)
- **Platform divergence:** mobile anchors billing to client presence, web bills from accept — same backend, opposite economics. **broken**
- **No "session is starting/waiting for you" affordance** for a client who isn't already on the chat screen (ties to stage 4). Combined with the above, a client can be charged before they ever see the session. **broken**
- On-connect `session_info` is a one-time snapshot; the live countdown is a **client-side** timer in `useChatSessionState`, while the backend `balance_monitor.py` *also* computes remaining time/warnings (`:32,36`) that the client largely ignores (ClientChat notes "Removed BALANCE_WARNING — using client-side timer") — two sources of truth for "time remaining" that can drift. **confusing**

---

## 6. Payment / top-up — low-balance, paused, Stripe entry points
**Current behavior**
- In-session top-up: `ClientChat` `handlePauseForTopUp` / `handleTopUpClick` → `topupChat` → `POST /chat/{id}/topup` (`chatApi.ts:171`, backend `chats.py:779`), which **pauses via SessionManager and returns a Stripe checkout URL**; the client is redirected. On return, `ClientChat` reads `?status=success|cancelled` and resumes/keeps-paused.
- Low-balance UX: `useChatSessionState` derives `showLowBalanceWarning` (≤5 min) and `showCriticalWarning` (≤1 min); the redesigned `ClientChat` shows a calm banner + "Add Stardust" (→ `handlePauseForTopUp`).
- Paused state: `POST /chat/{id}/pause` (psychic/admin, `chats.py:1232`) and `resume` (`chats.py:1011`, `/resume`); 30-minute paused-timeout auto-end applies.
- Insufficient balance mid-session: backend emits `BALANCE_INSUFFICIENT`; `ClientChat.handleBalanceInsufficient` **ends** the session and shows the summary.
- Other Stardust entry points (not the session flow): Navbar pill → `StardustModal` → `POST /payment/create-checkout-session` (points package); Billing page `StardustGlider` → `POST /payment/create-stardust-checkout-session`; `SessionSummaryModal.onTopUp` → `/billing`.

**Gaps**
- **Three different purchase flows** with different endpoints and mental models: in-session `/chat/{id}/topup` (pauses + Stripe), Navbar package checkout, and Billing custom-amount checkout. A user topping up mid-reading vs from the navbar gets different screens. **confusing**
- **Insufficient balance ends (not pauses) the reading** after the grace window, while the low-balance banner invites you to "add Stardust" to *keep going* — if the top-up round-trip (pause → Stripe → return → resume) doesn't complete inside the window, the reading is already over. Tight, easy-to-lose race with no "we're holding your reading" state. **broken/confusing**
- Top-up requires a **full-page redirect to Stripe** mid-reading; if the client bounces or the redirect fails there's no inline retry, and the chat is left paused (recoverable but unguided). **confusing**
- Backend `balance_monitor` warning thresholds (300s/120s, `balance_monitor.py:36,74`) don't match the client-side banner thresholds (300s/60s) — inconsistent "when do I get warned." **confusing**

---

## 7. End — chat ends, session closes out
**Current behavior**
- Triggers: client "End Chat" or psychic/admin end → `updateChatStatus(id, {status:"ENDED"})`; or auto-end on insufficient balance; or decline (ENDED-while-REQUESTED, `chats.py:544`, or ARCHIVED, `:687`).
- Backend `chats.py:542` ENDED branch: `session_manager.end_session(... MANUAL_EXIT ...)` (`:611`), computes final `elapsed_seconds`/`estimated_cost` (`:616-618`), notifies **both** client and psychic (`CHAT_ENDED`, `:625-677`), and broadcasts+stores a termination system message (`get_termination_message` → `broadcast_system_message`, `:682-685`).
- Client: `useChatSessionState` `CHAT_ENDED` handler + `ClientChat` show the `SessionSummaryModal` (duration + Stardust spent), with warm end-reason variants and an ended-state footer ("Book another reading" / "Browse psychics").

**Gaps**
- **The summary modal only appears if the client is on the chat screen at end.** If the psychic ends the reading while the client is elsewhere, the client gets a `CHAT_ENDED` *notification* (bell → `/notifications`) but **no summary of duration/cost** — they must reopen the chat to see it. Client/psychic see different closure experiences for the same event. **confusing**
- Two decline/cancel code paths (`ENDED`-while-`REQUESTED` at `:544` vs `ARCHIVED` at `:687`) both notify and broadcast — duplicated logic that can drift. **cosmetic**
- End reason for the *client* is derived from the WS `reason` string (e.g. "insufficient_balance"); if that string is absent/renamed, the summary silently falls back to a generic reason. **cosmetic**
- No post-reading prompt to **rate/review** the psychic or leave feedback at end. **confusing** (missing feedback state)
- **Voluntary end shows the wrong (low-balance) summary.** When the client clicks "End Chat" with Stardust still remaining, the `SessionSummaryModal` shows the "Your reading time has run out / Add Stardust" variant instead of the graceful "Your reading has ended / Book another reading" variant — it defaults to the low-balance framing regardless of *why* the chat ended. Likely cause: `ClientChat.tsx` sets `sessionSummaryData.endReason` from **multiple** places, and the timer-reached-0 auto-end effect (`useEffect` at ~`:499`, and `handleBalanceInsufficient` ~`:262`) hard-codes `"Session ended - insufficient balance"` and can fire/overwrite even on a manual end (backend sends reason `"user_initiated"`, `chats.py:633`), so `SessionSummaryModal`'s `ranOutOfBalance = /balance|insufficient|.../` test (`SessionSummaryModal.tsx`) matches. Needs a single source of truth for the end reason keyed on the actual backend reason. **broken**
- **Admin/psychic side still shows the session as active/connected after the client ends it.** After the client voluntarily ends the chat, `PsychicSessionGlass` continues to render the session as ACTIVE/connected — the `CHAT_ENDED` event isn't flipping the psychic's view to ended (stale status and/or the WS/session state not being reconciled on the psychic side). Client and psychic disagree on the same terminal event. **broken**

---

## Cross-cutting inconsistencies (client vs psychic, web vs app)
- **Billing anchor:** web bills from accept (no `/join`), mobile bills from client join → same event, different cost. `broken`
- **Presence:** psychic never learns whether the web client actually opened the chat. `confusing`
- **Deep-linking:** neither the bell nor the notifications list opens the specific live chat. `broken`
- **Time-remaining source of truth:** backend `balance_monitor` vs client-side timer, with mismatched thresholds. `confusing`
- **Dead code masquerading as real:** `PsychicSession.tsx`, `PsychicRequestTable.tsx` (mock data). `broken` (as a maintenance/trust hazard)

---

## Severity roll-up
- **broken:** web never `/join`s → billing runs from accept (stage 5); no deep-link to the live chat on accept (stage 4); insufficient-balance ends the reading during the top-up race (stage 6); orphaned/mock psychic code (stage 3).
- **confusing:** "Start Reading" really means "request" with no cost preview (stage 1); empty `201` on request (stage 2); admins can't accept from chat-detail (stage 3); no client-present signal to psychic (stage 4/5); three different purchase flows + threshold mismatch (stage 6); no end summary when client is away, no review prompt (stage 7).
- **cosmetic:** accept copy drift; duplicate decline paths; generic end-reason fallback.

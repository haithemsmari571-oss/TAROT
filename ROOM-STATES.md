# Every state the reading room can render

Read end to end from
[ClientChat.tsx](tarot-landing-web/src/features/chat/views/ClientChat.tsx) (2218
lines) and [SessionBar.tsx](tarot-landing-web/src/features/chat/components/SessionBar.tsx)
(139 lines). Thirty-six distinct renderings. Every line reference is to those two
files unless named otherwise.

The column **Action** is what the client can currently *do* in that state. No
state may lose one.

---

## A · Before the room draws at all

| # | State | Trigger | Draws | Its own text | Action |
|---|---|---|---|---|---|
| 1 | Dev preview injector | `?preview=` in DEV only — `ClientChat.tsx:1029-1035` | replaces the whole page with `ChatStatePreview` | — | mode buttons `:2097` |
| 2 | Loading | `loading` from `useChats()` — `:1037-1047` | spinner, full height | "Loading your messages..." | none |
| 3 | Load error | `error` from `useChats()` — `:1049-1073` | red triangle card | "Unable to Load Chats" + the error text `:1060` | **Try Again** → `refetch` `:1062` |
| 4 | No chat selected | `!selectedChat` — `:1302-1316` | empty illustration | "Select a conversation" / "Choose a chat from the list to start your mystical journey" | pick from the list |

## B · The reader header — `:1400-1454`

| # | State | Trigger | Draws | Text | Action |
|---|---|---|---|---|---|
| 5 | Header | always, once a chat is open `:1400` | back arrow, avatar, name | reader name `:1437` | **Back** `:1402`; **open profile** `:1409` |
| 6 | Status word | derived `:1431` | one word under the name | `Active` / `Paused` / `Ended` / `Pending` / `Cancelled` | — |
| 7 | Live dot | `isChatActive` `:1440` | green dot | — | — |
| 8 | End button | `isChatActive \|\| isPaused` `:1447` | red pill | "End" | **End** → confirm `:1449` |

## C · The session bar — `SessionBar.tsx`, mounted `:1450-1459`

| # | State | Trigger | Draws | Text | Action |
|---|---|---|---|---|---|
| 9 | Time normal | `remaining > 300` `SessionBar.tsx:46-54` | white readout | "N min" | — |
| 10 | Time low | `remaining <= 300` `:46` | gold readout | "N min" | — |
| 11 | Time critical | `remaining <= 60` `:47` | amber readout | "N min" | — |
| 12 | Time paused | `isPaused` `:56` | muted readout | "Paused" | — |
| 13 | Time loading | `minutesLeft == null` `:58` | "—" | "—" | — |
| 14 | Stardust readout | always `:91-119` | gold balance + plus badge | "Stardust", the balance | **tap to top up** `:93` |
| 15 | Connected | `isConnected` `:132` | green dot | "Connected" | — |
| 16 | Reconnecting | `!isConnected` `:132` | gold dot | "Reconnecting…" | — |
| 17 | Elapsed caption | always `:135` | small caption | "M:SS elapsed" | — |

## D · The thread — `:1463-1631`

| # | State | Trigger | Draws | Text | Action |
|---|---|---|---|---|---|
| 18 | Loading messages | `loadingMessages` `:1463` | spinner | "Connecting..." `:1476` | — |
| 19 | Connection failed | `:1487` | red text | "Connection failed" | — |
| 20 | Empty thread | no messages `:1498` | centred copy | "No messages yet" / "Start the conversation!" | — |
| 21 | Older messages | `hasMoreMessages` `:1509-1524` | button | "Load Older Messages" / "Loading..." | **Load older** `:1509` |
| 22 | Messages | `:1558-1568` | `MessageBubble` per message | the messages | — |
| 23 | Reader typing | `isReaderTyping && ACTIVE` `:1624` | typing dots | — | — |
| 24 | Ended banner | `ENDED && messages.length` `:1573-1587` | red card in the thread | "Session Ended" / "This chat session has been concluded. You can request a new session below." | — |
| 25 | Pending banner | `REQUESTED` `:1590-1604` | yellow card | "Waiting for Psychic" / "Your chat request is pending. Your reading should begin within 3 minutes." | — |
| 26 | Not-accepted banner | `ARCHIVED` `:1607-1621` | grey card | "Request Not Accepted" / "This chat request was not accepted. You can try requesting again." | — |

## E · The low-balance warning — `:1635-1660`

| # | State | Trigger | Draws | Text | Action |
|---|---|---|---|---|---|
| 27 | ~1 minute left | `isChatActive && showCriticalWarning` `:1635` | hourglass banner | "You have {about N minutes / less than a minute / very little time} of reading time left. Add Stardust to keep your reading going." `:1647`, label built `:1092-1097` | **Add Stardust** → `handlePauseForTopUp` `:1651` |

## F · The composer area — four mutually exclusive branches, `:1663-1849`

| # | State | Trigger | Draws | Text | Action |
|---|---|---|---|---|---|
| 28 | Active composer | `isChatActive` `:1663` | input + send | placeholder "Type your message..." | **type**, **send** `:1683` |
| 29 | …disconnected | `!isConnected` `:1672` | disabled input | "Connecting..." + "Connecting to chat..." `:1698` | — |
| 30 | …session ended | `status==='ENDED'` `:1674` | disabled input | "Session ended" | — |
| 31 | Paused panel | `isPaused` `:1702` | amber card | "Reading paused" / "Waiting for your reader to resume." or "Your Stardust ran low — add more to keep going." `:1711-1719`; body `:1733`; "Session cost so far: £X" `:1737` | **Resume** `:1742`, **Add Stardust** `:1752`, **End Chat** `:1762` |
| 32 | Grace panel | `isPaused && isGrace` `:1077,1711` | same card + countdown | "Out of Stardust" / "Not enough Stardust for another minute with {reader}." ; `0:SS` + "to top up" `:1723-1726`; body `:1732` | same three |
| 33 | Requested panel | `REQUESTED` `:1773` | yellow card | "Waiting for Psychic" / "Your chat request is pending" / "Usually within 3 minutes" | **Cancel Request** `:1795` (pending text "Canceling...") |
| 34 | Ended panel | `ENDED` `:1812` | moon card | "Your reading has ended" / "We hope it brought you clarity. You're welcome back any time." | **Book another reading** `:1832`, **Browse psychics** `:1841` |
| 35 | No composer | anything else, incl. `ARCHIVED` `:1849` | nothing | — | — |

## G · Sheets, sidebars and modals

| # | State | Trigger | Draws | Action |
|---|---|---|---|---|
| 36 | Reader sidebar (desktop) | `selectedChatData` `:1853-1877`, spinner `:1860` | `PsychicProfileCard` | — |
| 37 | Profile sheet (mobile) | `showProfileSheet` `:1883` | bottom sheet | close |
| 38 | Request-another modal | `showRequestModal` `:1930` | textarea + error `requestError` | send / cancel |
| 39 | Session summary | `showSessionSummaryModal` `:1982`, auto-opened on end `:667` | duration + cost + end reason | close |
| 40 | End confirm | `showEndConfirm` `:1990` | confirm dialog | confirm / cancel |

---

## Terminal states and where they come from

There is no separate "reader declined", "expired" or "client ended" rendering.
All of them collapse into **status `ENDED`** or **`ARCHIVED`** before they reach
the view, and the distinguishing text arrives as `endReason` on the session:

- insufficient balance → `endReason` "Session ended - insufficient balance (less than 10 seconds remaining)" `:335`, and `:385`
- reader ended / client ended / any socket end → `SESSION_ENDED` `:360-365`, `endReason` from the event `:385`, default "Session ended" `:665`
- request refused or cancelled → `ARCHIVED`, drawn by #26 and #35
- the reason is only ever *shown* in the session summary modal (#39), never in the room itself

That matters for the mapping: the receipt on the "ended" screen is the only place
these can be told apart, so `endReason` has to reach it.

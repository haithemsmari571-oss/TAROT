/* A reader's name as clients see it (ROUND34 item 2; src/features/client-app/readerName.ts).
   Run: node scripts/test-reader-name.mts
   The table is the backend's (TAROT-BACKEND/tests/test_reader_display_name.py), so the
   screens and the emails name her alike. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { readerDisplayName } = await import("../src/features/client-app/readerName.ts");

// Her username is her display name: Title case, as the card writes it. Each
// word, and each part after an apostrophe, starts with a capital (ROUND56).
const DISPLAY_NAMES: [string, string][] = [
  ["Sophie", "Sophie"],
  ["Delphine", "Delphine"],
  ["AMRIT", "Amrit"],
  ["sophie", "Sophie"],
  ["Mary Ann", "Mary Ann"],
  ["MARY ANN", "Mary Ann"],
  ["mary ann", "Mary Ann"],
  ["mARY aNN", "Mary Ann"],
  ["Zoé", "Zoé"],
  ["ZOÉ MARIE", "Zoé Marie"],
  ["O'Brien", "O'Brien"],
  ["o'neil", "O'Neil"],
  ["O'NEIL", "O'Neil"],
  ["o’neil", "O’Neil"],
  ["mary ann o'neil", "Mary Ann O'Neil"],
  ["  Delphine  ", "Delphine"],
];
// A handle: the first name part, with a capital letter.
const HANDLES: [string, string][] = [
  ["end_control_reader_fee70ab6", "End"],
  ["round33_away_1790508249517", "Round"],
  ["sophie-moon", "Sophie"],
  ["sophie-moon-2", "Sophie"],
  ["anne.marie", "Anne"],
  ["user123", "User"],
  ["_x9", "X"],
  ["Mary  Ann", "Mary"],
  ["mary-ann", "Mary"],
  ["o'neil_reader_2", "O'Neil"],
  ["sophie@example.com", "Sophie"],
  // nothing in it that could be a name
  ["12345", ""],
];
const EMPTY: [string | null | undefined, string][] = [["", ""], [null, ""], [undefined, ""]];

let checks = 0;
for (const [username, shown] of [...DISPLAY_NAMES, ...HANDLES, ...EMPTY]) {
  assert.equal(readerDisplayName(username), shown, `${JSON.stringify(username)} is shown as ${JSON.stringify(shown)}`);
  // the rule holds its own output
  assert.equal(readerDisplayName(shown), shown, `${JSON.stringify(shown)} stays`);
  checks += 2;
}
for (const [username] of HANDLES) {
  const shown = readerDisplayName(username);
  assert.notEqual(shown.toLowerCase(), username.toLowerCase(), `${username} is never shown raw`);
  assert.match(shown, /^[\p{L}'’]*$/u, `${username} is shown as letters only`);
  checks += 2;
}

// Every app screen that names a reader goes through the rule, never her raw username.
const source = (path: string) => readFileSync(new URL(`../src/features/client-app/${path}`, import.meta.url), "utf8");
const appReaders = source("appReaders.tsx");
assert.match(appReaders, /export const readerName = \(reader: Pick<Psychic, "username">\) => readerDisplayName\(reader\.username\);/);
const room = source("ClientThreadScreen.tsx");
assert.match(room, /readerName=\{readerName\(reader\)\}/, "the room's header, typing line and titles");
assert.match(room, /keep going with \$\{readerName\(reader\)\}/, "the room's top-up reason");
assert.doesNotMatch(room, /reader\.username/, "the room never prints the username");
const chats = source("ClientChatsScreen.tsx");
assert.match(chats, /const name = readerDisplayName\(reader\.display_name\);/, "the chats list row");
assert.doesNotMatch(chats, /\{reader\.display_name/, "the chats list never prints the username");
const readers = source("ClientReadersScreen.tsx");
assert.match(readers, /<PsychicCard psychic=\{\{ \.\.\.reader, username: readerName\(reader\) \}\}/, "the Readers tab card");
// ROUND56: the shared card Title-cases a username its own way ("Mary ann"),
// so the app hands it the name as the app writes it, drawn as given.
assert.match(readers, /<PsychicCard [^\n]*shownName=\{readerName\(reader\)\}/, "the Readers tab card draws the app's name");
const card = readFileSync(new URL("../src/features/browse/components/PsychicCard.tsx", import.meta.url), "utf8");
assert.match(card, /const displayName = shownName \?\? \(/, "the card draws the name it is given");
checks += 10;

console.log(`reader names: ${checks} checks passed`);

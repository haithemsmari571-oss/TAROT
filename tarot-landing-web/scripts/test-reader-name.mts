/* A reader's name as clients see it (ROUND34 item 2; src/features/client-app/readerName.ts).
   Run: node scripts/test-reader-name.mts
   The table is the backend's (TAROT-BACKEND/tests/test_reader_display_name.py), so the
   screens and the emails name her alike. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { readerDisplayName } = await import("../src/features/client-app/readerName.ts");

// Her username is her display name: Title case, as the card writes it.
const DISPLAY_NAMES: [string, string][] = [
  ["Sophie", "Sophie"],
  ["Delphine", "Delphine"],
  ["AMRIT", "Amrit"],
  ["sophie", "Sophie"],
  ["Mary Ann", "Mary ann"],
  ["Zoé", "Zoé"],
  ["O'Brien", "O'brien"],
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
checks += 8;

console.log(`reader names: ${checks} checks passed`);

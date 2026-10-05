/* A reader's ethnicity as countries (ROUND56; src/features/client-app/countries.ts).
   Run: node scripts/test-countries.mts
   The app's list and the server's (TAROT-BACKEND/app/enums/country_codes.py
   ISO_COUNTRY_CODES) must hold exactly the same codes: the server refuses any
   code it does not know, and the app names only codes it knows. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { COUNTRIES, ETHNICITY_SEPARATOR, countriesOf, ethnicityLine, flagOf } = await import("../src/features/client-app/countries.ts");

let checks = 0;
const check = (fn: () => void) => {
  fn();
  checks += 1;
};

// The server's codes, read from its one module.
const backend = readFileSync(new URL("../../TAROT-BACKEND/app/enums/country_codes.py", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const block = backend.match(/^ISO_COUNTRY_CODES = frozenset\(\(\n([\s\S]*?)\n\)\)$/m);
assert.ok(block, "the server's ISO_COUNTRY_CODES block");
const serverCodes = [...block[1].matchAll(/"([A-Z]{2})"/g)].map((match) => match[1]);
const appCodes = COUNTRIES.map((country) => country.code);

check(() => assert.equal(serverCodes.length, 249, "the server lists 249 codes"));
check(() => assert.equal(new Set(serverCodes).size, 249, "each once on the server"));
check(() => assert.equal(appCodes.length, 249, "the app lists 249 countries"));
check(() => assert.equal(new Set(appCodes).size, 249, "each once in the app"));
check(() => assert.deepEqual([...appCodes].sort(), [...serverCodes].sort(), "the app and the server hold exactly the same codes"));
check(() => assert.match(backend, new RegExp(`^ETHNICITY_SEPARATOR = "${ETHNICITY_SEPARATOR}"$`, "m"), "the same separator"));

for (const country of COUNTRIES) {
  check(() => assert.match(country.code, /^[A-Z]{2}$/, `${country.code} is two capitals`));
  check(() => assert.ok(country.name.trim() && country.name === country.name.trim(), `${country.code} has a name`));
  check(() => assert.ok(country.demonym.trim() && country.demonym === country.demonym.trim(), `${country.code} has a demonym`));
  const flag = flagOf(country.code);
  check(() => assert.equal([...flag].length, 2, `${country.code}'s flag is two regional indicators`));
  check(() => assert.ok([...flag].every((symbol) => symbol.codePointAt(0)! >= 0x1f1e6 && symbol.codePointAt(0)! <= 0x1f1ff)));
}

// The prompt's own examples.
const named = (code: string) => COUNTRIES.find((country) => country.code === code);
check(() => assert.deepEqual(named("MA"), { code: "MA", name: "Morocco", demonym: "Moroccan" }));
check(() => assert.deepEqual(named("GB"), { code: "GB", name: "United Kingdom", demonym: "British" }));
check(() => assert.deepEqual(named("RO"), { code: "RO", name: "Romania", demonym: "Romanian" }));
check(() => assert.deepEqual(named("US"), { code: "US", name: "United States", demonym: "American" }));

// What clients read.
check(() => assert.equal(flagOf("MA"), "\u{1F1F2}\u{1F1E6}"));
check(() => assert.equal(ethnicityLine("MA"), "\u{1F1F2}\u{1F1E6} Moroccan"));
check(() => assert.equal(ethnicityLine("GB,RO"), "\u{1F1EC}\u{1F1E7} \u{1F1F7}\u{1F1F4} British · Romanian"));
check(() => assert.equal(ethnicityLine("RO,GB"), "\u{1F1F7}\u{1F1F4} \u{1F1EC}\u{1F1E7} Romanian · British"));
// Anything that is not countries says nothing: free text kept from before, an
// unknown or lower-case code, a stray space or comma, nothing at all.
for (const value of ["British Romanian", "British Indian", "Irish", "XX", "UK", "ma", "GB, RO", "GB,", ",RO", "GBR", "", null, undefined]) {
  check(() => assert.equal(ethnicityLine(value), null, `${JSON.stringify(value)} shows nothing`));
  check(() => assert.equal(countriesOf(value), null));
}

// Every place that shows her ethnicity reads it through ethnicityLine, never raw.
const source = (path: string) => readFileSync(new URL(`../src/features/${path}`, import.meta.url), "utf8");
const facts = source("client-app/ReaderFacts.tsx");
check(() => assert.match(facts, /ethnicityLine\(reader\.ethnicity\)/, "the /app reader profile"));
check(() => assert.doesNotMatch(facts, /reader\.ethnicity \|\|/, "never the raw value"));
check(() => assert.match(source("owner/OwnerReadersScreen.tsx"), /const ethnicity = ethnicityLine\(reader\.ethnicity\);/, "the owner's list"));
check(() => assert.match(source("owner/OwnerReaderScreen.tsx"), /ethnicityLine\(reader\.ethnicity\)/, "the owner's reader screen"));
check(() => assert.match(source("owner/OwnerReaderScreen.tsx"), /<OwnerCountryPicker/, "the owner's form picks countries"));

console.log(`countries: ${checks} checks passed`);

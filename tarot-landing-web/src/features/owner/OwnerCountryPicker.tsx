import { useEffect, useId, useRef, useState } from "react";
import { COUNTRIES, countriesOf, ETHNICITY_SEPARATOR, flagOf, type Country } from "@/features/client-app/countries";

const COPY = {
  search: "Search countries",
  none: "No country matches.",
  hint: (max: number) => `One country, or up to ${max} for mixed heritage.`,
  full: (max: number) => `At most ${max} countries. Remove one to choose another.`,
  remove: (name: string) => `Remove ${name}`,
  list: "Countries",
} as const;

/* Once the iPhone keyboard has risen over the lower half of the screen, the
   search field moves to the top so the list shows between them. */
const KEYBOARD_SETTLE_MS = 350;

/* Accents and case ignored, so "cote" finds Côte d'Ivoire (the Home search's
   rule, ClientHomeScreen.tsx). */
const fold = (text: string) => text.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

const BY_NAME = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, "en"));

/* Every country not picked yet, alphabetical; while she types, the closest
   first: the name itself, then names that start so, then a word in the name
   or the demonym, then any name or demonym holding what she typed. */
function countriesMatching(query: string, picked: string[]): Country[] {
  const typed = fold(query);
  const open = BY_NAME.filter((country) => !picked.includes(country.code));
  if (!typed) return open;
  const closeness = (country: Country) => {
    const name = fold(country.name);
    const demonym = fold(country.demonym);
    if (name === typed || demonym === typed || country.code.toLowerCase() === typed) return 0;
    if (name.startsWith(typed)) return 1;
    if (name.split(/[\s-]+/).some((word) => word.startsWith(typed)) || demonym.startsWith(typed)) return 2;
    if (name.includes(typed) || demonym.includes(typed)) return 3;
    return null;
  };
  return open
    .map((country) => ({ country, rank: closeness(country) }))
    .filter((match): match is { country: Country; rank: number } => match.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((match) => match.country);
}

/* Her ethnicity on the owner's form (ROUND56): the countries picked as chips
   that a tap removes, and a search field over every country, flag and name
   per row. One country, or up to the server's limit. */
export default function OwnerCountryPicker({
  codes,
  max,
  disabled,
  onChange,
}: {
  codes: string[];
  max: number;
  disabled: boolean;
  onChange: (codes: string[]) => void;
}) {
  const id = useId();
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const settle = useRef<number | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const picked = countriesOf(codes.join(ETHNICITY_SEPARATOR)) ?? [];
  const full = codes.length >= max;
  const rows = open && !full ? countriesMatching(query, codes) : [];

  /* A tap anywhere outside the picker closes the list. */
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => () => window.clearTimeout(settle.current), []);

  const reveal = () => {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => searchRef.current?.scrollIntoView({ block: "start" }), KEYBOARD_SETTLE_MS);
  };
  const pick = (code: string) => {
    onChange([...codes, code]);
    setQuery("");
    setOpen(false);
    searchRef.current?.blur();
  };

  return (
    <div className="owner-country-picker" ref={pickerRef}>
      {picked.length > 0 && (
        <ul className="owner-chips owner-country-chips">
          {picked.map((country) => (
            <li key={country.code}>
              <button
                type="button"
                className="owner-chip owner-country-chip"
                aria-label={COPY.remove(country.name)}
                data-country={country.code}
                disabled={disabled}
                onClick={() => onChange(codes.filter((code) => code !== country.code))}
              >
                <span className="owner-country-flag" aria-hidden="true">{flagOf(country.code)}</span>
                {country.name}
                <span className="owner-country-remove" aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {full ? (
        <p className="owner-caption-hint">{COPY.full(max)}</p>
      ) : (
        <>
          <input
            ref={searchRef}
            className="owner-input owner-country-search"
            aria-label={COPY.search}
            aria-controls={`${id}-countries`}
            placeholder={COPY.search}
            value={query}
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={disabled}
            onFocus={() => {
              setOpen(true);
              reveal();
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "Enter") {
                // Never the form's Save: the closest country is picked.
                event.preventDefault();
                if (query.trim() && rows.length > 0) pick(rows[0].code);
              }
            }}
          />
          {open && (
            <ul className="owner-country-list" id={`${id}-countries`} aria-label={COPY.list}>
              {rows.map((country) => (
                <li key={country.code}>
                  <button type="button" className="owner-country-row" data-country={country.code} onClick={() => pick(country.code)}>
                    <span className="owner-country-flag" aria-hidden="true">{flagOf(country.code)}</span>
                    {country.name}
                  </button>
                </li>
              ))}
              {rows.length === 0 && <li className="owner-country-none" role="status">{COPY.none}</li>}
            </ul>
          )}
          {codes.length === 0 && <p className="owner-caption-hint">{COPY.hint(max)}</p>}
        </>
      )}
    </div>
  );
}

/* The Readers tab: her favourites first, as a shelf of discs, then the browse
   page's tools (search, categories, price range, online now, the count and the
   pages) over the roster on the site's own reader card, on the shell's living
   sky. Online readers come first. A card leads to the reader's profile; the
   heart over each card marks the reader as a favourite, and a disc on the
   shelf opens her profile. The tools live in the URL (q, category, min, max,
   online, page), so the way back from a profile and a reload keep them. */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Link, useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { categoriesApi } from "@/features/browse/api/categoriesApi";
import { NumericPagination } from "@/features/browse/components/NumericPagination";
import { PriceRangeFilter } from "@/features/browse/components/PriceRangeFilter";
import PsychicCard from "@/features/browse/components/PsychicCard";
import { SearchableMultiSelect } from "@/features/browse/components/SearchableMultiSelect";
import type { Psychic } from "@/features/browse/types/psychic.types";
import { useBillingMode } from "@/features/billing-mode/BillingModeContext";
import { pickReaders, ReaderDisc, readerName, useAppReaders } from "./appReaders";
import { READERS_PATH } from "./clientAppPaths";
import FavouriteHeart from "./FavouriteHeart";
import { useFavourites } from "./useFavourites";
import { useGiftCredit } from "./useWelcomeCredit";
import "./client-chats.css";
import "./client-readers.css";
import "./client-favourites.css";

const SHELF_COPY = { eyebrow: "Your favourites" } as const;

/* The browse page's numbers (PsychicsBrowse.tsx:17 ITEMS_PER_PAGE, :48 the
   debounce). That file is off limits to this job, so they are restated here. */
const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 500;

/* The search params the tools live in. */
const QUERY_PARAM = "q";
const CATEGORY_PARAM = "category";
const MIN_PARAM = "min";
const MAX_PARAM = "max";
const ONLINE_PARAM = "online";
const PAGE_PARAM = "page";
/* Marks the tools' own URL writes (always a replace), told apart from a
   Readers tab press (a push) or a history move (a pop). The marker stays on
   the history entry, so a pop back onto it is read as a move, not a write. */
const FROM_TOOLS = { readersTools: true };
const isFromTools = (state: unknown) => (state as typeof FROM_TOOLS | null)?.readersTools === true;

/* Online readers first, then the others, each group in the API's own order,
   which is the site's display order. Two filters rather than a comparator, so
   nothing inside a group is ever re-sorted. */
const onlineFirst = (readers: Psychic[]) => [...readers.filter(reader => reader.is_online), ...readers.filter(reader => !reader.is_online)];

/* The readings of the URL. Ids and prices that are not numbers are dropped. */
const readIds = (value: string | null) => (value ?? "").split(",").map(Number).filter(id => Number.isInteger(id) && id > 0);
const readPrice = (value: string | null) => { const price = value === null || value === "" ? NaN : Number(value); return Number.isFinite(price) && price >= 0 ? price : undefined; };
const readPage = (value: string | null) => { const page = Number(value); return Number.isInteger(page) && page > 1 ? page : 1; };

/* The browse page's price rule (PsychicsBrowse.tsx:93-98): no range, every
   reader; a range, only a reader with a price inside it. */
const priceWithin = (price: number | null, min: number | undefined, max: number | undefined) => {
  if (min === undefined && max === undefined) return true;
  if (price == null || price <= 0) return false;
  return (min === undefined || price >= min) && (max === undefined || price <= max);
};

export default function ClientReadersScreen() {
  const navigate = useNavigate();
  const readers = useAppReaders();
  const favourites = useFavourites();
  const welcomeCreditGbp = useGiftCredit();
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => categoriesApi.getCategories(), staleTime: 5 * 60_000 });
  const { billingMode } = useBillingMode();
  // Per-message unless the server says per-minute (BillingModeContext.tsx).
  const perMessage = billingMode !== "per_minute";
  const empty = !!readers.data && readers.data.total === 0;
  // The shelf shows only readers the roster holds, so it is empty until the
  // roster and the favourites have both been read.
  const shelf = pickReaders(favourites.ids, readers.data?.items);

  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get(QUERY_PARAM) ?? "";
  const categoryIds = readIds(searchParams.get(CATEGORY_PARAM));
  const minPrice = readPrice(searchParams.get(MIN_PARAM));
  const maxPrice = readPrice(searchParams.get(MAX_PARAM));
  const onlineOnly = searchParams.get(ONLINE_PARAM) === "1";
  const hasActiveFilters = query !== "" || categoryIds.length > 0 || minPrice !== undefined || maxPrice !== undefined || onlineOnly;

  /* The router commits a URL change in a transition, so the hook's value can
     lag a write by a render, and a timer set by an earlier render would
     otherwise write from the URL as it was then. Every write starts from the
     latest URL the screen has seen. An empty value drops its param. replace
     keeps typing out of the history. */
  const params = useRef(searchParams);
  params.current = searchParams;
  const setParams = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params.current);
    for (const [name, value] of Object.entries(values)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    setSearchParams(next, { replace: true, state: FROM_TOOLS });
  };
  // Every change of a filter goes back to the first page (PsychicsBrowse.tsx:47, :122, :129).
  const setFilter = (values: Record<string, string | null>) => setParams({ ...values, [PAGE_PARAM]: null });

  /* The field keeps its own copy of the text and writes it through after the
     browse page's pause (PsychicsBrowse.tsx:44-51); Enter and the Search
     button write it at once (:144-147). The copy follows the URL only when
     something other than the field moved it (the Readers tab, a history move). */
  const location = useLocation();
  const navigationType = useNavigationType();
  const [draft, setDraft] = useState(query);
  const field = useRef<HTMLInputElement>(null);
  const [seenKey, setSeenKey] = useState(location.key);
  if (location.key !== seenKey) {
    setSeenKey(location.key);
    const ownWrite = navigationType === "REPLACE" && isFromTools(location.state);
    if (!ownWrite && draft !== query) setDraft(query);
  }
  const search = (value: string) => { setDraft(value); setFilter({ [QUERY_PARAM]: value }); };
  useEffect(() => {
    if (draft === query) return;
    const timer = setTimeout(() => {
      // The URL may have caught up meanwhile (a clear, Enter, Clear all): then there is nothing to write.
      if ((params.current.get(QUERY_PARAM) ?? "") !== draft) setFilter({ [QUERY_PARAM]: draft });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // The pause restarts on typing alone; the URL's own moves sync the draft above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const clearFilters = () => { setDraft(""); setParams({ [QUERY_PARAM]: null, [CATEGORY_PARAM]: null, [MIN_PARAM]: null, [MAX_PARAM]: null, [ONLINE_PARAM]: null, [PAGE_PARAM]: null }); };

  /* What the browse page asks the server for, applied here over the roster the
     app already holds (limit 100, one answer for every screen): the search is
     the server's, a case-insensitive substring of the name or the bio
     (TAROT-BACKEND app/filters/psychic.py:20-27); every chosen category must be
     on the reader (:15-19); online is the reader's is_online; the price is the
     message price under per-message billing, else the minute price. */
  const needle = query.trim().toLowerCase();
  const matching = onlineFirst((readers.data?.items ?? []).filter(reader =>
    (needle === "" || reader.username.toLowerCase().includes(needle) || (reader.bio ?? "").toLowerCase().includes(needle))
    && categoryIds.every(id => (reader.categories ?? []).some(category => category.id === id))
    && (!onlineOnly || reader.is_online)
    && priceWithin(perMessage ? reader.price_per_message ?? null : (reader.price_per_second || 0) * 60, minPrice, maxPrice),
  ));
  const totalPages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(readPage(searchParams.get(PAGE_PARAM)), totalPages);
  const shown = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="client-readers" aria-label="Readers">
      <header className="client-chats-header">
        <p className="client-chats-eyebrow">Choose your reader</p>
        <h1 className="client-chats-title">Readers</h1>
      </header>
      {shelf.length > 0 && (
        <section className="client-favs-shelf" aria-label={SHELF_COPY.eyebrow}>
          <p className="client-chats-eyebrow">{SHELF_COPY.eyebrow}</p>
          <ul className="client-favs-shelf-list">
            {shelf.map(reader => (
              <li key={reader.id}>
                <Link to={`${READERS_PATH}/${reader.id}`} className="client-favs-shelf-item">
                  <ReaderDisc reader={reader} />
                  <span className="client-favs-shelf-name">{readerName(reader)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {readers.data && !empty && (
        <div className="client-readers-tools">
          {/* The browse page's search pill (PsychicsBrowse.tsx:190-213). */}
          <form className="gl-search" role="search" onSubmit={event => { event.preventDefault(); search(draft); }}>
            <input
              ref={field}
              type="text"
              placeholder="Search by name, gift, or what you need answered…"
              aria-label="Search readers"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              autoComplete="off"
            />
            {draft && (
              <button type="button" className="gl-search-clear" onClick={() => { search(""); field.current?.focus(); }} title="Clear search" aria-label="Clear search">
                <Icon icon="ph:x" />
              </button>
            )}
            <button type="submit" className="gl-search-btn">Search</button>
          </form>
          {/* The browse page's filter chips (PsychicsBrowse.tsx:218-249). */}
          <div className="gl-filters client-readers-filters">
            <button
              type="button"
              className={`gl-fchip ${onlineOnly ? "gl-fchip--on" : ""}`}
              aria-pressed={onlineOnly}
              onClick={() => setFilter({ [ONLINE_PARAM]: onlineOnly ? null : "1" })}
            >
              <span className="gl-dot" /> Online now
            </button>
            <SearchableMultiSelect
              options={categories.data ?? []}
              selectedIds={categoryIds}
              onChange={ids => setFilter({ [CATEGORY_PARAM]: ids.join(",") })}
              placeholder="Select categories..."
              label="Categories"
              variant="chip"
            />
            <PriceRangeFilter
              minPrice={minPrice}
              maxPrice={maxPrice}
              onChange={(min, max) => setFilter({ [MIN_PARAM]: min !== undefined ? String(min) : null, [MAX_PARAM]: max !== undefined ? String(max) : null })}
              label={perMessage ? "Price range (per message)" : "Price range (per minute)"}
              unit={perMessage ? "message" : "minute"}
            />
            {hasActiveFilters && (
              <button type="button" className="gl-fchip" onClick={clearFilters}>
                <Icon icon="ph:x-circle" className="text-sm" /> Clear all
              </button>
            )}
          </div>
          {/* The browse page's count line (PsychicsBrowse.tsx:252-258). */}
          <div className="gl-count" role="status">
            <span>{matching.length} {matching.length === 1 ? "reader" : "readers"}</span>
          </div>
        </div>
      )}
      {readers.isPending && <p className="client-chats-notice" role="status">Loading readers…</p>}
      {readers.isError && <p className="client-chats-notice" role="alert">Could not load readers. <button onClick={() => { void readers.refetch(); }}>Try again</button></p>}
      {empty && <div className="client-chats-empty"><p>No readers right now.</p></div>}
      {readers.data && !empty && shown.length > 0 && (
        <div className="gl-grid">
          {shown.map(reader => (
            <div key={reader.id} className="client-readers-card">
              {/* The shared card names a reader by her username; here it gets the app's name (readerName.ts). */}
              <PsychicCard psychic={{ ...reader, username: readerName(reader) }} welcomeCreditGbp={welcomeCreditGbp} onClick={() => navigate(`${READERS_PATH}/${reader.id}`)} />
              <FavouriteHeart readerId={reader.id} name={readerName(reader)} />
            </div>
          ))}
        </div>
      )}
      {/* The browse page's no-results state (PsychicsBrowse.tsx:310-320). */}
      {readers.data && !empty && shown.length === 0 && (
        <div className="gl-state">
          <Icon icon="ph:ghost" className="gl-acc text-5xl mb-4 mx-auto" />
          <p>No readers found matching your criteria</p>
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="gl-btn-solid">
              Clear Filters
            </button>
          )}
        </div>
      )}
      {/* The browse page's pages (PsychicsBrowse.tsx:297-305); NumericPagination draws nothing for one page. */}
      {readers.data && !empty && totalPages > 1 && (
        <div className="client-readers-pages">
          <NumericPagination currentPage={page} totalPages={totalPages} onPageChange={next => setParams({ [PAGE_PARAM]: next > 1 ? String(next) : null })} />
        </div>
      )}
    </section>
  );
}

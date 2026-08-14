import { Icon } from "@iconify/react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { psychicsApi } from "../api/psychicsApi";
import { categoriesApi } from "../api/categoriesApi";
import { Psychic } from "../types/psychic.types";
import { Category } from "../types/category.types";
import PageBackground from "../../../components/PageBackground";
import moonlitBalcony from "../../../assets/backgrounds/moonlit-balcony.webp";
import { SearchableMultiSelect } from "../components/SearchableMultiSelect";
import { NumericPagination } from "../components/NumericPagination";
import { PriceRangeFilter } from "../components/PriceRangeFilter";
import PsychicCard from "../components/PsychicCard";
import "../../../styles/glass.css";

const ITEMS_PER_PAGE = 12;

const PsychicsBrowse = () => {
  const navigate = useNavigate();
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [psychics, setPsychics] = useState<Psychic[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Filter states
  const [minPrice, setMinPrice] = useState<number | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [isOnlineOnly, setIsOnlineOnly] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on search
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await categoriesApi.getCategories();
        setCategories(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error fetching categories:", err);
      }
    };

    fetchCategories();
  }, []);

  // Fetch psychics when filters change
  useEffect(() => {
    const fetchPsychics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Convert prices from per-minute to per-second for backend
        const minPricePerSecond = minPrice !== undefined ? minPrice / 60 : undefined;
        const maxPricePerSecond = maxPrice !== undefined ? maxPrice / 60 : undefined;

        const filters = {
          search: debouncedSearch || undefined,
          categories_ids: selectedCategories.length > 0 ? selectedCategories.join(",") : undefined,
          is_online: isOnlineOnly || undefined,
          min_price: minPricePerSecond,
          max_price: maxPricePerSecond,
          skip: (currentPage - 1) * ITEMS_PER_PAGE,
          limit: ITEMS_PER_PAGE,
        };

        const data = await psychicsApi.getPsychics(filters);
        setPsychics(data.items ?? []);
        setTotalCount(data.total);
        setTotalPages(Math.ceil(data.total / ITEMS_PER_PAGE));
      } catch (err) {
        console.error("Error fetching psychics:", err);
        setError("Failed to load psychics. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchPsychics();
  }, [debouncedSearch, selectedCategories, currentPage, minPrice, maxPrice, isOnlineOnly]);

  // Handle category change
  const handleCategoryChange = useCallback((categoryIds: number[]) => {
    setSelectedCategories(categoryIds);
    setCurrentPage(1); // Reset to first page on filter change
  }, []);

  // Handle price change
  const handlePriceChange = useCallback((min?: number, max?: number) => {
    setMinPrice(min);
    setMaxPrice(max);
    setCurrentPage(1); // Reset to first page on filter change
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSelectedCategories([]);
    setSearchQuery("");
    setMinPrice(undefined);
    setMaxPrice(undefined);
    setIsOnlineOnly(false);
    setCurrentPage(1);
  }, []);

  // The Search pill's button just flushes the debounce — same query semantics,
  // it only skips the 500ms wait.
  const applySearchNow = useCallback(() => {
    setDebouncedSearch(searchQuery);
    setCurrentPage(1);
  }, [searchQuery]);

  // Check if any filters are active
  const hasActiveFilters = selectedCategories.length > 0 || searchQuery || minPrice !== undefined || maxPrice !== undefined || isOnlineOnly;

  // ✅ Computed values: Explicitly map sequence orders descending/ascending safely
  const sortedPsychics = useMemo(() => {
    return [...psychics].sort((a, b) => {
      const orderA = a.order ?? 9999;
      const orderB = b.order ?? 9999;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return b.id - a.id; // Fallback sorting priority for same values: Newest first
    });
  }, [psychics]);

  return (
    <div className="relative min-h-screen pb-20">
      {/* The moonlit scene stays vivid in both moods; the token tint carries mood. */}
      <PageBackground images={moonlitBalcony} variant="glass" />

      {/* Main content */}
      <div className="relative z-10">
        {/* HERO */}
        <section className="gl-hero">
          {/* In daylight this panel is the frosted surface that carries
              readability; in candlelight it is invisible (no bg/padding). */}
          <div className="gl-hero-panel">
            <div className="gl-kicker">Private love readings &amp; tarot clarity</div>
            <h1 className="gl-h1">
              Someone here already
              <br />
              <i>sees what you can't.</i>
            </h1>
            <p className="gl-sub">
              {totalCount > 0 ? `${totalCount} intuitive readers` : "Intuitive readers"}, live
              now. Private, judgment-free readings on love, timing and the unsaid —{" "}
              <b>your first reading is free with £15 credit.</b>
            </p>

            {/* SEARCH PILL */}
            <div className="gl-search">
              <input
                type="text"
                placeholder="Search by name, gift, or what you need answered…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearchNow();
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="gl-search-clear"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                >
                  <Icon icon="ph:x" />
                </button>
              )}
              <button type="button" className="gl-search-btn" onClick={applySearchNow}>
                Search
              </button>
            </div>
          </div>
        </section>

        {/* FILTER CHIPS */}
        <div className="gl-filters">
          <button
            type="button"
            className={`gl-fchip ${isOnlineOnly ? "gl-fchip--on" : ""}`}
            onClick={() => setIsOnlineOnly(!isOnlineOnly)}
          >
            <span className="gl-dot" /> Online now
          </button>

          <SearchableMultiSelect
            options={categories}
            selectedIds={selectedCategories}
            onChange={handleCategoryChange}
            placeholder="Select categories..."
            label="Categories"
            variant="chip"
          />

          <PriceRangeFilter
            minPrice={minPrice}
            maxPrice={maxPrice}
            onChange={handlePriceChange}
            label="Price range (per minute)"
          />

          {hasActiveFilters && (
            <button type="button" className="gl-fchip" onClick={clearFilters}>
              <Icon icon="ph:x-circle" className="text-sm" /> Clear all
            </button>
          )}
        </div>

        {/* COUNT LINE — glass pill in daylight, loose text in candlelight */}
        {!loading && !error && (
          <div className="gl-count">
            <span>
              {totalCount} {totalCount === 1 ? "reader" : "readers"} found
            </span>
          </div>
        )}

        {/* LOADING STATE */}
        {loading && (
          <div className="gl-state">
            <Icon icon="ph:spinner" className="gl-acc text-5xl mb-4 animate-spin mx-auto" />
            <p>Gathering the readers…</p>
          </div>
        )}

        {/* ERROR STATE */}
        {error && (
          <div className="gl-state">
            <Icon icon="ph:warning" className="gl-acc text-5xl mb-4 mx-auto" />
            <p>{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="gl-btn-solid"
            >
              Retry
            </button>
          </div>
        )}

        {/* PSYCHICS GRID */}
        {!loading && !error && (
          <>
            <div className="gl-grid">
              {sortedPsychics.map((psychic) => (
                <PsychicCard
                  key={psychic.id}
                  psychic={psychic}
                  onClick={() => navigate(`/psychics/${psychic.id}/details`)}
                />
              ))}
            </div>

            {/* PAGINATION */}
            {psychics.length > 0 && totalPages > 1 && (
              <div className="pb-16 -mt-10">
                <NumericPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </>
        )}

        {/* NO RESULTS */}
        {!loading && !error && psychics.length === 0 && (
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
      </div>
    </div>
  );
};

export default PsychicsBrowse;
import { Icon } from "@iconify/react";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { psychicsApi } from "../api/psychicsApi";
import { categoriesApi } from "../api/categoriesApi";
import { Psychic } from "../types/psychic.types";
import { Category } from "../types/category.types";
import { SearchableMultiSelect } from "../components/SearchableMultiSelect";
import { NumericPagination } from "../components/NumericPagination";
import { PriceRangeFilter } from "../components/PriceRangeFilter";
import { ToggleSwitch } from "../components/ToggleSwitch";
import "../../../styles/starfield.css";



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

  // Handle online filter toggle
  const toggleOnlineFilter = useCallback(() => {
    setIsOnlineOnly((prev) => !prev);
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

  // Convert price per second to price per minute
  const getPricePerMinute = (pricePerSecond: number) => {
    return (pricePerSecond * 60).toFixed(2);
  };

  // Check if any filters are active
  const hasActiveFilters = selectedCategories.length > 0 || searchQuery || minPrice !== undefined || maxPrice !== undefined || isOnlineOnly;

  return (
    <div 
      className="relative min-h-screen pt-32 pb-20" 
      style={{ backgroundColor: COLORS.dark }}
    >
      {/* Starfield Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="starfield"></div>
        <div className="starfield-dense"></div>
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
        {/* HEADER */}
        <div className="text-center mb-8 sm:mb-12 space-y-3 sm:space-y-4">
          <h1
            style={{ ...TYPOGRAPHY.headings.h1, fontSize: "clamp(2.5rem, 6vw, 4rem)" }}
            className="tracking-tighter leading-[1]"
          >
            Explore Our <span style={{ color: COLORS.primary }}>Psychic Readers</span>
          </h1>
          <p className="text-base opacity-60 max-w-2xl mx-auto" style={{ color: COLORS.neutralWhite }}>
            Connect with experienced spiritual advisors ready to guide you on your journey
          </p>
        </div>

        {/* SEARCH BAR */}
        <div className="max-w-3xl mx-auto mb-6 sm:mb-8">
          <div
            className="relative rounded-2xl overflow-hidden border"
            style={{
              backgroundColor: COLORS.surface,
              borderColor: `${COLORS.neutralWhite}10`,
            }}
          >
            <Icon
              icon="ph:magnifying-glass"
              className="absolute left-5 top-1/2 -translate-y-1/2 text-xl"
              style={{ color: COLORS.neutralWhite + "40" }}
            />
            <input
              type="text"
              placeholder="Search by name or bio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-3 sm:py-4 pl-12 sm:pl-14 pr-12 sm:pr-14 bg-transparent text-white placeholder-white/40 outline-none"
              style={{ fontFamily: TYPOGRAPHY.fontFamily.body }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-5 top-1/2 -translate-y-1/2 hover:opacity-70 transition-opacity"
              >
                <Icon icon="ph:x" className="text-xl" style={{ color: COLORS.neutralWhite + "40" }} />
              </button>
            )}
          </div>
        </div>

        {/* FILTERS SECTION */}
        <div className="max-w-5xl mx-auto mb-8 sm:mb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-4 sm:mb-6">
            {/* Categories Multiselect */}
            <SearchableMultiSelect
              options={categories}
              selectedIds={selectedCategories}
              onChange={handleCategoryChange}
              placeholder="Select categories..."
              label="Categories"
            />

            {/* Online Status Toggle */}
            <div className="flex flex-col">
              <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: COLORS.neutralWhite + "80" }}>
                Availability
              </label>
              <button
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all"
                style={{
                  backgroundColor: `${COLORS.surface}`,
                  borderColor: isOnlineOnly ? COLORS.primary : `${COLORS.neutralWhite}10`,
                }}
                onClick={() => setIsOnlineOnly(!isOnlineOnly)}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isOnlineOnly ? 'bg-green-400' : 'bg-white/20'}`} />
                  <span className="text-sm font-medium" style={{ color: COLORS.neutralWhite }}>
                    Online Only
                  </span>
                </div>
                <ToggleSwitch
                  checked={isOnlineOnly}
                  onChange={setIsOnlineOnly}
                />
              </button>
            </div>

            {/* Price Range Filter */}
            <PriceRangeFilter
              minPrice={minPrice}
              maxPrice={maxPrice}
              onChange={handlePriceChange}
              label="Price Range (per minute)"
            />
          </div>

          {/* Results Count and Clear Filters */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            {/* Results Count */}
            {!loading && (
              <span className="text-sm font-medium" style={{ color: COLORS.neutralWhite }}>
                <span style={{ color: COLORS.primary }} className="font-bold">{totalCount}</span>{" "}
                {totalCount === 1 ? "psychic" : "psychics"} found
              </span>
            )}

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2"
                style={{
                  backgroundColor: `${COLORS.neutralWhite}05`,
                  color: COLORS.primary,
                  border: `1px solid ${COLORS.primary}40`,
                }}
              >
                <Icon icon="ph:x-circle" className="text-base" />
                Clear All Filters
              </button>
            )}
          </div>
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div className="text-center py-20">
            <Icon icon="ph:spinner" className="text-6xl mb-4 animate-spin mx-auto" style={{ color: COLORS.primary }} />
            <p className="text-lg opacity-60" style={{ color: COLORS.neutralWhite }}>
              Loading psychics...
            </p>
          </div>
        )}

        {/* ERROR STATE */}
        {error && (
          <div className="text-center py-20">
            <Icon icon="ph:warning" className="text-6xl mb-4 mx-auto" style={{ color: COLORS.primary }} />
            <p className="text-lg opacity-60 mb-4" style={{ color: COLORS.neutralWhite }}>
              {error}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider"
              style={{
                backgroundColor: COLORS.primary,
                color: COLORS.dark,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* PSYCHICS GRID */}
        {!loading && !error && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 mb-12">
              {psychics?.map((psychic, index) => (
                <div
                  key={psychic.id}
                  onClick={() => navigate(`/psychics/${psychic.id}/details`)}
                  className="relative rounded-3xl overflow-hidden cursor-pointer group flex flex-col backdrop-blur-xl transition-all duration-200 hover:shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.surface}dd 0%, ${COLORS.surfaceAccent}dd 100%)`,
                    border: `1px solid ${COLORS.neutralWhite}15`,
                    boxShadow: `0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px ${COLORS.primary}10`,
                  }}
                >
                  {/* IMAGE SECTION */}
                  <div className="relative h-56 sm:h-72 w-full overflow-hidden">
                    {psychic.profile_picture_url ? (
                      <>
                        <img
                          src={psychic.profile_picture_url}
                          alt={psychic.username}
                          className="w-full h-full object-cover"
                        />
                        <div 
                          className="absolute inset-0"
                          style={{
                            background: `linear-gradient(to bottom, transparent 0%, ${COLORS.dark}00 40%, ${COLORS.dark}dd 100%)`,
                          }}
                        />
                      </>
                    ) : (
                      <div 
                        className="w-full h-full flex items-center justify-center relative"
                        style={{ 
                          background: `linear-gradient(135deg, ${COLORS.surface} 0%, ${COLORS.surfaceAccent} 100%)` 
                        }}
                      >
                        <svg
                          width="120"
                          height="120"
                          viewBox="0 0 120 120"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="opacity-40"
                        >
                          <circle cx="60" cy="60" r="55" stroke={COLORS.primary} strokeWidth="2" strokeOpacity="0.3" fill="none" />
                          <circle cx="60" cy="60" r="50" stroke={COLORS.primary} strokeWidth="1" strokeOpacity="0.2" fill="none" />
                          <circle cx="60" cy="45" r="15" fill={COLORS.primary} opacity="0.3" />
                          <path d="M 30 90 Q 30 65 60 65 Q 90 65 90 90" fill={COLORS.primary} opacity="0.3" />
                          <path d="M 60 20 L 62 25 L 67 25 L 63 28 L 65 33 L 60 30 L 55 33 L 57 28 L 53 25 L 58 25 Z" fill={COLORS.primary} opacity="0.4" />
                          <circle cx="25" cy="40" r="2" fill={COLORS.primary} opacity="0.3" />
                          <circle cx="95" cy="40" r="2" fill={COLORS.primary} opacity="0.3" />
                        </svg>
                      </div>
                    )}

                    {/* ONLINE STATUS - Floating badge */}
                    {psychic.is_online && (
                      <div 
                        className="absolute top-4 right-4 px-3 py-1.5 rounded-full border flex items-center gap-2 backdrop-blur-xl"
                        style={{
                          backgroundColor: `${COLORS.dark}cc`,
                          borderColor: `${COLORS.primary}40`,
                          boxShadow: `0 0 20px ${COLORS.primary}30`,
                        }}
                      >
                        <div 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: COLORS.primary }}
                        />
                        <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: COLORS.primary }}>
                          Online
                        </span>
                      </div>
                    )}

                    {/* NAME OVERLAY */}
                    <div className="absolute bottom-0 left-0 right-0 p-5 z-10">
                      <h3
                        className="uppercase tracking-tight text-2xl font-black"
                        style={{ 
                          color: COLORS.neutralWhite,
                          textShadow: `0 2px 10px ${COLORS.dark}`,
                        }}
                      >
                        {psychic.username}
                      </h3>
                    </div>
                  </div>

                  {/* INFO SECTION */}
                  <div className="relative flex flex-col flex-1 p-4 sm:p-6 space-y-3 sm:space-y-4">
                    {/* SPECIALTIES */}
                    <div className="flex flex-wrap gap-2">
                      {(psychic.categories ?? []).slice(0, 3).map((category) => (
                        <span
                          key={category.id}
                          className="px-3 py-1.5 rounded-full text-[10px] uppercase font-bold tracking-wider"
                          style={{
                            backgroundColor: `${COLORS.primary}15`,
                            color: COLORS.primary,
                            border: `1px solid ${COLORS.primary}30`,
                          }}
                        >
                          {category.title}
                        </span>
                      ))}
                      {(psychic.categories?.length ?? 0) > 3 && (
                        <span
                          className="px-3 py-1.5 rounded-full text-[10px] uppercase font-bold tracking-wider"
                          style={{
                            backgroundColor: `${COLORS.neutralWhite}10`,
                            color: COLORS.neutralWhite,
                            opacity: 0.6,
                          }}
                        >
                          +{(psychic.categories?.length ?? 0) - 3}
                        </span>
                      )}
                    </div>

                    {/* BIO */}
                    <p 
                      className="text-sm leading-relaxed opacity-70 line-clamp-3 italic flex-1" 
                      style={{ color: COLORS.neutralWhite }}
                    >
                      "{psychic.bio}"
                    </p>

                    {/* STATS BAR */}
                    <div 
                      className="flex items-center justify-between p-3 rounded-xl"
                      style={{
                        backgroundColor: `${COLORS.neutralWhite}05`,
                        border: `1px solid ${COLORS.neutralWhite}10`,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Icon 
                          icon="ph:calendar-dots" 
                          className="text-base" 
                          style={{ color: COLORS.primary }} 
                        />
                        <span className="text-xs font-medium" style={{ color: COLORS.neutralWhite }}>
                          {(psychic.availability?.length ?? 0) > 0 ? `${psychic.availability.length} slots` : "No availability"}
                        </span>
                      </div>
                      <div className="h-4 w-px" style={{ backgroundColor: `${COLORS.neutralWhite}20` }} />
                      <div className="flex items-center gap-1.5">
                        <Icon 
                          icon="ph:coins" 
                          className="text-base" 
                          style={{ color: COLORS.primary }} 
                        />
                        <span className="text-sm font-bold" style={{ color: COLORS.primary }}>
                          ${getPricePerMinute(psychic.price_per_second)}
                        </span>
                        <span className="text-[10px] uppercase font-medium opacity-70" style={{ color: COLORS.neutralWhite }}>
                          /min
                        </span>
                      </div>
                    </div>

                    {/* CTA BUTTON */}
                    <button
                      className="w-full py-3 sm:py-4 rounded-2xl flex items-center justify-center gap-2 sm:gap-3 relative overflow-hidden transition-opacity duration-200 hover:opacity-90"
                      style={{
                        background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
                        fontFamily: TYPOGRAPHY.fontFamily.heading,
                        boxShadow: `0 8px 20px ${COLORS.primary}30`,
                      }}
                    >
                      <Icon icon="ph:chat-circle-dots-fill" className="text-xl" style={{ color: COLORS.dark }} />
                      <span className="text-sm font-black uppercase tracking-wider" style={{ color: COLORS.dark }}>
                        Start Reading
                      </span>
                      <Icon icon="ph:arrow-right" className="text-lg" style={{ color: COLORS.dark }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* PAGINATION */}
            {psychics.length > 0 && totalPages > 1 && (
              <NumericPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            )}
          </>
        )}

        {/* NO RESULTS */}
        {!loading && !error && psychics.length === 0 && (
          <div className="text-center py-20">
            <Icon icon="ph:ghost" className="text-6xl mb-4 mx-auto" style={{ color: COLORS.primary }} />
            <p className="text-lg opacity-60 mb-4" style={{ color: COLORS.neutralWhite }}>
              No psychics found matching your criteria
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: COLORS.primary,
                  color: COLORS.dark,
                }}
              >
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

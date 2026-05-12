import React, { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../theme";
import PrimaryInput from "../CustomInputs/PrimaryInput";
import PrimarySelect from "../CustomInputs/PrimarySelect";
import PrimaryCheckbox from "../CustomInputs/PrimaryCheckbox";

export type Column<T> = {
  key: string;
  label: string;
  render: (item: T) => ReactNode;
  sortable?: boolean;
};

export interface PrimaryTableProps<T> {
  data: T[];
  columns: Column<T>[];
  actionsColumn?: (row: T) => React.ReactNode;
  rowSelectionEnabled?: boolean;
  pageSize?: number;
  isDataLoading?: boolean;
  onRowDelete?: (selectedIndices: number[]) => void;
  title?: string;
  searchEnabled?: boolean;
  filterOptions?: { label: string; value: string }[];
  onFilterChange?: (value: string) => void;
}

type SortConfig = {
  key: string;
  direction: "asc" | "desc";
};

export const PrimaryTable = <T extends Record<string, any>>({
  data,
  columns,
  actionsColumn,
  pageSize = 8,
  rowSelectionEnabled = false,
  isDataLoading = false,
  onRowDelete,
  title = "Database Records",
  searchEnabled = true,
  filterOptions,
  onFilterChange,
}: PrimaryTableProps<T>) => {
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [activePage, setActivePage] = useState(1);

  // --- Logic: Search + Filter ---
  const filteredData = data.filter((item) => {
    const searchMatch = search
      ? Object.values(item).some((v) => String(v).toLowerCase().includes(search.toLowerCase()))
      : true;
    const filterMatch = filterValue
      ? Object.values(item).some((v) => String(v) === filterValue)
      : true;
    return searchMatch && filterMatch;
  });

  // --- Logic: Sort ---
  const sortedData = [...filteredData];
  if (sortConfig) {
    sortedData.sort((a, b) => {
      const aVal = String(a[sortConfig.key]).toLowerCase();
      const bVal = String(b[sortConfig.key]).toLowerCase();
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }

  // --- Logic: Pagination ---
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = sortedData.slice((activePage - 1) * pageSize, activePage * pageSize);

  const handleSelectAll = () => {
    if (selectedRows.length === paginatedData.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(paginatedData.map((_, idx) => idx));
    }
  };

  const handleRowSelection = (idx: number) => {
    setSelectedRows(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  };

  const handleSortClick = (colKey: string) => {
    setSortConfig(prev => {
      if (prev?.key !== colKey) return { key: colKey, direction: "asc" };
      if (prev.direction === "asc") return { key: colKey, direction: "desc" };
      return null;
    });
  };

  return (
    <div className="w-full flex flex-col space-y-6" style={{ fontFamily: TYPOGRAPHY.fontFamily.body }}>
      
      {/* 1. TABLE TOP HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-4 mt-4 ">
        <div className="flex flex-col">
          <h2 className="text-xl font-black uppercase tracking-tighter text-white" style={{ fontFamily: TYPOGRAPHY.headings.h1.fontFamily }}>
            {title}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.primary, boxShadow: `0 0 8px ${COLORS.primary}` }} />
            <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: COLORS.neutralGray }}>
              {data.length} Detected Identities
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {searchEnabled && (
            <div className="w-64">
              <PrimaryInput
                value={search}
                placeholder="Search Database..."
                onChange={(e) => { setSearch(e.target.value); setActivePage(1); }}
                iconLeft={<Icon icon="solar:magnifer-linear" style={{ color: COLORS.primary }} className="text-xl" />}
              />
            </div>
          )}
          {filterOptions && (
            <PrimarySelect
              value={filterValue}
              options={[{ label: "Global Access", value: "" }, ...filterOptions]}
              onChange={(val) => { setFilterValue(val); onFilterChange?.(val); setActivePage(1); }}
              width="180px"
            />
          )}
        </div>
      </div>

      {/* 2. BULK ACTION BANNER */}
      <AnimatePresence>
        {selectedRows.length > 0 && (
          <motion.div 
            initial={{ height: 0, opacity: 0, y: -10 }} animate={{ height: 'auto', opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0, y: -10 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-3 rounded-2xl border backdrop-blur-md" 
                 style={{ backgroundColor: `${COLORS.primaryDark}20`, borderColor: `${COLORS.primary}30` }}>
              <div className="flex items-center gap-4">
                <button onClick={() => setSelectedRows([])} className="hover:opacity-60 transition-opacity">
                  <Icon icon="solar:close-circle-bold" style={{ color: COLORS.primary }} className="text-xl" />
                </button>
                <span className="text-[10px] font-black uppercase tracking-widest text-white">
                  {selectedRows.length} Personnel Selected
                </span>
              </div>
              <button 
                onClick={() => { onRowDelete?.(selectedRows); setSelectedRows([]); }}
                className="flex items-center gap-2 px-4 py-2 transition-all rounded-xl text-[10px] font-black uppercase text-white border"
                style={{ backgroundColor: `${COLORS.starGold}15`, borderColor: `${COLORS.starGold}40` }}
              >
                <Icon icon="solar:trash-bin-trash-bold" style={{ color: COLORS.starGold }} />
                Terminate Selected
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. THE TABLE BODY */}
      <div className="rounded-[28px] border overflow-hidden shadow-2xl" 
           style={{ borderColor: COLORS.neutralDarkGray, backgroundColor: COLORS.surface }}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b" style={{ borderColor: COLORS.neutralDarkGray, backgroundColor: `${COLORS.surfaceAccent}40` }}>
              {rowSelectionEnabled && (
                <th className="p-5 w-12 text-center">
                  <PrimaryCheckbox checked={selectedRows.length === paginatedData.length && paginatedData.length > 0} onChange={handleSelectAll} />
                </th>
              )}
              {columns.map((col) => (
                <th 
                  key={col.key} 
                  onClick={() => col.sortable && handleSortClick(col.key)}
                  className={`p-5 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${col.sortable ? 'cursor-pointer hover:text-white' : ''}`}
                  style={{ color: COLORS.neutralGray }}
                >
                  <div className="flex items-center gap-2">
                    {col.label}
                    {col.sortable && (
                      <Icon 
                        icon={sortConfig?.key === col.key ? (sortConfig.direction === "asc" ? "solar:sort-from-top-to-bottom-bold" : "solar:sort-from-bottom-to-top-bold") : "solar:sort-vertical-linear"} 
                        className={sortConfig?.key === col.key ? "text-primary" : "opacity-20"}
                      />
                    )}
                  </div>
                </th>
              ))}
              {actionsColumn && (
                <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-right" style={{ color: COLORS.neutralGray }}>
                  Protocol
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y" style={{ borderColor: `${COLORS.neutralDarkGray}50` }}>
            {isDataLoading ? (
              [...Array(pageSize)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {[...Array(columns.length + (rowSelectionEnabled ? 1 : 0) + (actionsColumn ? 1 : 0))].map((_, j) => (
                    <td key={j} className="p-6"><div className="h-3 bg-white/5 rounded-full w-2/3" /></td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={100} className="p-24 text-center">
                  <div className="flex flex-col items-center gap-4 opacity-20">
                    <Icon icon="solar:shield-warning-bold-duotone" className="text-7xl" />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Void Detected: No Data</span>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((item, idx) => {
                const isSelected = selectedRows.includes(idx);
                return (
                  <motion.tr 
                    key={idx} 
                    className={`transition-all duration-300 group ${isSelected ? '' : 'hover:bg-white/[0.02]'}`}
                    style={{ backgroundColor: isSelected ? `${COLORS.primary}05` : 'transparent' }}
                  >
                    {rowSelectionEnabled && (
                      <td className="p-5 text-center">
                        <PrimaryCheckbox checked={isSelected} onChange={() => handleRowSelection(idx)} />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className="p-5 text-[13px] font-medium text-white/80 group-hover:text-white transition-colors">
                        {col.render(item)}
                      </td>
                    ))}
                    {actionsColumn && (
                      <td className="p-5 text-right">
                        <div className="flex justify-end">
                          {actionsColumn(item)}
                        </div>
                      </td>
                    )}
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 4. PAGINATION FOOTER */}
      {totalPages > 1 && (
      <div className="flex flex-col md:flex-row items-center justify-end gap-4 px-4">

        <div className="flex items-center gap-2 p-1.5 rounded-2xl border mb-4" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.neutralDarkGray }}>
          <button 
            disabled={activePage === 1}
            onClick={() => setActivePage(prev => prev - 1)}
            className="p-2 rounded-xl transition-all hover:bg-white/5 disabled:opacity-5"
          >
            <Icon icon="solar:alt-arrow-left-linear" className="text-white text-lg" />
          </button>
          
          <div className="flex items-center gap-1.5 px-2">
            {[...Array(totalPages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setActivePage(i + 1)}
                className={`w-8 h-8 rounded-xl text-[10px] font-black transition-all border ${activePage === i + 1 ? 'shadow-lg' : 'border-transparent'}`}
                style={{ 
                    backgroundColor: activePage === i + 1 ? COLORS.primary : 'transparent',
                    color: activePage === i + 1 ? COLORS.dark : "#fff",
                    borderColor: activePage === i + 1 ? COLORS.primary : 'transparent',
                    boxShadow: activePage === i + 1 ? `0 0 15px ${COLORS.primary}40` : 'none'
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <button 
            disabled={activePage === totalPages}
            onClick={() => setActivePage(prev => prev + 1)}
            className="p-2 rounded-xl transition-all hover:bg-white/5 disabled:opacity-5"
          >
            <Icon icon="solar:alt-arrow-right-linear" className="text-white text-lg" />
          </button>
        </div>
      </div>
      )}

    </div>
  );
};
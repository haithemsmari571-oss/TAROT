import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS } from "../../../theme";

interface NumericPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const NumericPagination = ({
  currentPage,
  totalPages,
  onPageChange,
}: NumericPaginationProps) => {
  // Generate page numbers with ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showEllipsisStart = currentPage > 3;
    const showEllipsisEnd = currentPage < totalPages - 2;

    if (totalPages <= 7) {
      // Show all pages if total is 7 or less
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (showEllipsisStart) {
        pages.push("...");
      }

      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) {
          pages.push(i);
        }
      }

      if (showEllipsisEnd) {
        pages.push("...");
      }

      // Always show last page
      if (!pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  if (totalPages <= 1) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex justify-center items-center gap-2"
    >
      {/* Previous Button */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-2 sm:px-3 py-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
        style={{
          backgroundColor: currentPage === 1 ? `${COLORS.neutralWhite}05` : `${COLORS.neutralWhite}10`,
          color: COLORS.neutralWhite,
          border: `1px solid ${COLORS.neutralWhite}10`,
        }}
      >
        <Icon icon="ph:caret-left" className="text-base sm:text-lg" />
      </button>

      {/* Page Numbers */}
      {pageNumbers.map((page, index) => {
        if (page === "...") {
          return (
            <span
              key={`ellipsis-${index}`}
              className="px-2 sm:px-3 py-2 text-sm font-bold"
              style={{ color: COLORS.neutralWhite + "40" }}
            >
              ...
            </span>
          );
        }

        const pageNum = page as number;
        const isActive = pageNum === currentPage;

        return (
          <motion.button
            key={pageNum}
            onClick={() => onPageChange(pageNum)}
            whileHover={{ scale: isActive ? 1 : 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all min-w-[36px] sm:min-w-[40px]"
            style={{
              backgroundColor: isActive ? COLORS.primary : `${COLORS.neutralWhite}10`,
              color: isActive ? COLORS.dark : COLORS.neutralWhite,
              border: `1px solid ${isActive ? COLORS.primary : `${COLORS.neutralWhite}10`}`,
            }}
          >
            {pageNum}
          </motion.button>
        );
      })}

      {/* Next Button */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-2 sm:px-3 py-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
        style={{
          backgroundColor: currentPage === totalPages ? `${COLORS.neutralWhite}05` : `${COLORS.neutralWhite}10`,
          color: COLORS.neutralWhite,
          border: `1px solid ${COLORS.neutralWhite}10`,
        }}
      >
        <Icon icon="ph:caret-right" className="text-base sm:text-lg" />
      </button>
    </motion.div>
  );
};

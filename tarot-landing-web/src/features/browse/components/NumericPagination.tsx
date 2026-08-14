import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import "../../../styles/glass.css";

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
      className="flex justify-center items-center gap-2 flex-wrap"
    >
      {/* Previous Button */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="gl-page-btn"
        title="Previous page"
      >
        <Icon icon="ph:caret-left" className="text-base mx-auto" />
      </button>

      {/* Page Numbers */}
      {pageNumbers.map((page, index) => {
        if (page === "...") {
          return (
            <span key={`ellipsis-${index}`} className="gl-tf px-2 text-sm">
              …
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
            className={`gl-page-btn ${isActive ? "gl-page-btn--on" : ""}`}
          >
            {pageNum}
          </motion.button>
        );
      })}

      {/* Next Button */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="gl-page-btn"
        title="Next page"
      >
        <Icon icon="ph:caret-right" className="text-base mx-auto" />
      </button>
    </motion.div>
  );
};

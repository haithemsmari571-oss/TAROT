import React, { useState, useMemo, useEffect } from "react";
import { Icon } from "@iconify/react";
import { PrimaryTable, type Column } from "../../../components/Table/PrimaryTable";
import PrimarySelect from "../../../components/CustomInputs/PrimarySelect";
import PrimaryInput from "../../../components/CustomInputs/PrimaryInput";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { useEarnings } from "../hooks/useEarnings";
import { TransactionStatus } from "../../ledger/types/transaction.types";
import type { Transaction } from "../../ledger/types/transaction.types";
import { paymentApi } from "../../payment/api/paymentApi";

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

const Earnings = () => {
  const {
    earnings: earningsData,
    summary,
    loading,
    error,
    fetchEarnings,
    fetchSummary,
  } = useEarnings();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | "All">("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [unitPriceCents, setUnitPriceCents] = useState(100);

  // Debounce search to avoid too many API calls
  const debouncedSearch = useDebounce(search, 500);

  // Fetch earnings on component mount and when filters change
  useEffect(() => {
    const filters = {
      search: debouncedSearch || undefined,
      status: statusFilter !== "All" ? statusFilter : undefined,
      page: currentPage,
      limit: 20,
    };
    fetchEarnings(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, currentPage]);

  // Fetch summary on mount
  useEffect(() => {
    fetchSummary();
    paymentApi.getUnitPrice()
      .then((data) => setUnitPriceCents(data.unit_price_cents))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset filters
  const handleResetFilters = () => {
    setSearch("");
    setStatusFilter("All");
    setCurrentPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters = search !== "" || statusFilter !== "All";

  const earnings = earningsData?.transactions || [];
  const totalEarnings = earningsData?.total || 0;

  // Calculate statistics from current page
  const currentPageStats = useMemo(() => {
    const completed = earnings.filter(
      (t) => t.status === TransactionStatus.COMPLETED
    );
    const totalAmount = completed.reduce((sum, t) => sum + t.amount, 0);

    return {
      totalAmount,
      completedCount: completed.length,
    };
  }, [earnings]);

  // Format currency (points to USD for display)
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format((amount * unitPriceCents) / 100);
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // Get status display
  const getStatusDisplay = (status: TransactionStatus) => {
    switch (status) {
      case TransactionStatus.COMPLETED:
        return { color: "#4ADE80", label: "Completed" };
      case TransactionStatus.PENDING:
        return { color: COLORS.starGold, label: "Pending" };
      case TransactionStatus.FAILED:
        return { color: "#F87171", label: "Failed" };
      case TransactionStatus.REVERSED:
        return { color: COLORS.secondary, label: "Reversed" };
    }
  };

  const columns: Column<Transaction>[] = [
    {
      key: "id",
      label: "Session ID",
      sortable: true,
      render: (transaction) => (
        <div className="flex flex-col">
          <span
            className="text-white font-bold leading-tight"
            style={{ fontSize: TYPOGRAPHY.fontSize.sm }}
          >
            TXN-{transaction.id.toString().padStart(6, "0")}
          </span>
          <span
            style={{ color: COLORS.neutralGray, fontSize: "9px" }}
            className="uppercase font-black tracking-widest opacity-40"
          >
            {formatDate(transaction.created_at)}
          </span>
        </div>
      ),
    },
    {
      key: "user_id",
      label: "Client",
      render: (transaction) => (
        <div className="flex flex-col">
          <span className="text-white font-bold text-xs">
            {transaction.username || `User #${transaction.user_id}`}
          </span>
          <span className="text-[9px] text-white/20 uppercase font-black">
            {transaction.user_email || `ID: ${transaction.user_id}`}
          </span>
        </div>
      ),
    },
    {
      key: "amount",
      label: "Earned",
      sortable: true,
      render: (transaction) => {
        return (
          <div className="flex flex-col">
            <span
              className="text-white font-bold text-sm"
              style={{ color: "#4ADE80" }}
            >
              +{formatCurrency(transaction.amount)}
            </span>
            <span className="text-[9px] text-white/20 uppercase font-black">
              Points earned
            </span>
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (transaction) => {
        const statusDisplay = getStatusDisplay(transaction.status);
        return (
          <div className="flex items-center gap-2">
            <div
              className="w-1 h-1 rounded-full animate-pulse"
              style={{
                backgroundColor: statusDisplay.color,
                boxShadow: `0 0 6px ${statusDisplay.color}`,
              }}
            />
            <span
              style={{ color: statusDisplay.color, fontSize: "9px" }}
              className="font-black uppercase tracking-widest"
            >
              {statusDisplay.label}
            </span>
          </div>
        );
      },
    },
    {
      key: "description",
      label: "Description",
      render: (transaction) => (
        <div className="max-w-xs">
          <span className="text-white/60 text-[10px] font-medium truncate block">
            {transaction.description}
          </span>
          {transaction.related_chat_id && (
            <span className="text-[9px] text-white/20 uppercase font-black">
              Chat #{transaction.related_chat_id}
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div
      className="p-12 min-h-screen"
      style={{
        backgroundColor: COLORS.dark,
        fontFamily: TYPOGRAPHY.fontFamily.body,
      }}
    >
      {/* Header */}
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h1
            style={TYPOGRAPHY.headings.h2}
            className="uppercase italic tracking-tighter"
          >
            My <span style={{ color: COLORS.primary }}>Earnings</span>
          </h1>
          <p
            style={{ color: COLORS.neutralGray }}
            className="text-[10px] font-bold uppercase tracking-[0.5em] mt-2 opacity-50"
          >
            Track Your Session Earnings
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        {/* Total Earnings */}
        <div
          className="p-6 rounded-[24px] border border-white/5"
          style={{ backgroundColor: COLORS.surface }}
        >
          <div className="flex items-center justify-between mb-4">
            <Icon
              icon="solar:wallet-money-bold-duotone"
              className="text-3xl"
              style={{ color: COLORS.primary }}
            />
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: COLORS.neutralGray }}
            >
              Total Earned
            </span>
          </div>
          <div className="text-3xl font-black" style={{ color: "#4ADE80" }}>
            {summary ? formatCurrency(summary.totalEarnings) : "$0.00"}
          </div>
          <div
            className="text-[9px] font-black uppercase tracking-widest mt-1"
            style={{ color: COLORS.neutralGray }}
          >
            All Time
          </div>
        </div>

        {/* Total Sessions */}
        <div
          className="p-6 rounded-[24px] border border-white/5"
          style={{ backgroundColor: COLORS.surface }}
        >
          <div className="flex items-center justify-between mb-4">
            <Icon
              icon="solar:chat-round-line-bold-duotone"
              className="text-3xl"
              style={{ color: COLORS.secondary }}
            />
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: COLORS.neutralGray }}
            >
              Sessions
            </span>
          </div>
          <div className="text-3xl font-black text-white">
            {summary?.totalSessions || 0}
          </div>
          <div
            className="text-[9px] font-black uppercase tracking-widest mt-1"
            style={{ color: COLORS.neutralGray }}
          >
            Total Sessions
          </div>
        </div>

        {/* Unique Clients */}
        <div
          className="p-6 rounded-[24px] border border-white/5"
          style={{ backgroundColor: COLORS.surface }}
        >
          <div className="flex items-center justify-between mb-4">
            <Icon
              icon="solar:users-group-rounded-bold-duotone"
              className="text-3xl"
              style={{ color: COLORS.starGold }}
            />
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: COLORS.neutralGray }}
            >
              Clients
            </span>
          </div>
          <div className="text-3xl font-black" style={{ color: COLORS.starGold }}>
            {summary?.uniqueClients || 0}
          </div>
          <div
            className="text-[9px] font-black uppercase tracking-widest mt-1"
            style={{ color: COLORS.neutralGray }}
          >
            Unique Clients
          </div>
        </div>

        {/* Pending Earnings */}
        <div
          className="p-6 rounded-[24px] border border-white/5"
          style={{ backgroundColor: COLORS.surface }}
        >
          <div className="flex items-center justify-between mb-4">
            <Icon
              icon="solar:clock-circle-bold-duotone"
              className="text-3xl"
              style={{ color: "#F59E0B" }}
            />
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: COLORS.neutralGray }}
            >
              Pending
            </span>
          </div>
          <div className="text-3xl font-black" style={{ color: "#F59E0B" }}>
            {summary ? formatCurrency(summary.pendingEarnings) : "$0.00"}
          </div>
          <div
            className="text-[9px] font-black uppercase tracking-widest mt-1"
            style={{ color: COLORS.neutralGray }}
          >
            Processing
          </div>
        </div>
      </div>

      {/* Controls Container */}
      <div
        className="p-6 rounded-[32px] border border-white/5 mb-10 flex flex-wrap items-end gap-6 shadow-2xl backdrop-blur-sm"
        style={{ backgroundColor: `${COLORS.surface}80` }}
      >
        {/* Search */}
        <div className="flex-1 min-w-[300px]">
          <PrimaryInput
            label="Search Earnings"
            placeholder="Search by client, description, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon="solar:magnifer-bold-duotone"
          />
        </div>

        {/* Status Filter */}
        <div className="w-[200px]">
          <PrimarySelect
            label="Status"
            value={statusFilter}
            onChange={(value) =>
              setStatusFilter(value as TransactionStatus | "All")
            }
            options={[
              { value: "All", label: "All Statuses" },
              { value: TransactionStatus.COMPLETED, label: "Completed" },
              { value: TransactionStatus.PENDING, label: "Pending" },
              { value: TransactionStatus.FAILED, label: "Failed" },
              { value: TransactionStatus.REVERSED, label: "Reversed" },
            ]}
          />
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <button
            onClick={handleResetFilters}
            className="px-6 py-3 rounded-xl border transition-all duration-300 hover:scale-105 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest"
            style={{
              backgroundColor: COLORS.surfaceAccent,
              borderColor: COLORS.neutralDarkGray,
              color: COLORS.primary,
            }}
          >
            <Icon icon="solar:refresh-bold-duotone" className="text-lg" />
            Clear Filters
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div
          className="p-4 rounded-2xl border border-red-500/20 mb-6"
          style={{ backgroundColor: "rgba(248, 113, 113, 0.1)" }}
        >
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Table with server-side pagination info */}
      <div className="space-y-4">
        {!loading && earnings.length > 0 && (
          <div className="flex items-center justify-between px-4">
            <div
              className="text-[9px] font-black uppercase tracking-[0.2em]"
              style={{ color: COLORS.neutralGray }}
            >
              Page {currentPage} of {earningsData?.pages || 1} • Total:{" "}
              {totalEarnings} earnings
            </div>

            <div
              className="flex items-center gap-2 p-1.5 rounded-2xl border"
              style={{
                backgroundColor: COLORS.surface,
                borderColor: COLORS.neutralDarkGray,
              }}
            >
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => prev - 1)}
                className="p-2 rounded-xl transition-all hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <Icon
                  icon="solar:alt-arrow-left-linear"
                  className="text-white text-lg"
                />
              </button>

              <div className="flex items-center gap-1.5 px-2">
                {Array.from({ length: earningsData?.pages || 1 }, (_, i) => i + 1)
                  .filter((page) => {
                    // Show first page, last page, current page, and pages around current
                    const totalPages = earningsData?.pages || 1;
                    return (
                      page === 1 ||
                      page === totalPages ||
                      Math.abs(page - currentPage) <= 1
                    );
                  })
                  .map((page, idx, arr) => {
                    // Add ellipsis if there's a gap
                    const prevPage = arr[idx - 1];
                    const showEllipsis = prevPage && page - prevPage > 1;

                    return (
                      <React.Fragment key={page}>
                        {showEllipsis && (
                          <span
                            className="px-2 text-[10px]"
                            style={{ color: COLORS.neutralGray }}
                          >
                            ...
                          </span>
                        )}
                        <button
                          onClick={() => setCurrentPage(page)}
                          className={`w-8 h-8 rounded-xl text-[10px] font-black transition-all border ${
                            currentPage === page ? "shadow-lg" : "border-transparent"
                          }`}
                          style={{
                            backgroundColor:
                              currentPage === page ? COLORS.primary : "transparent",
                            color:
                              currentPage === page ? COLORS.dark : COLORS.neutralGray,
                            borderColor:
                              currentPage === page ? COLORS.primary : "transparent",
                            boxShadow:
                              currentPage === page
                                ? `0 0 15px ${COLORS.primary}40`
                                : "none",
                          }}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    );
                  })}
              </div>

              <button
                disabled={currentPage === (earningsData?.pages || 1)}
                onClick={() => setCurrentPage((prev) => prev + 1)}
                className="p-2 rounded-xl transition-all hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <Icon
                  icon="solar:alt-arrow-right-linear"
                  className="text-white text-lg"
                />
              </button>
            </div>
          </div>
        )}

        {/* Table - pageSize set to high number to show all items from current server page */}
        <PrimaryTable
          columns={columns}
          data={earnings}
          isDataLoading={loading}
          searchEnabled={false}
          title="Earnings Records"
          pageSize={100}
        />
      </div>
    </div>
  );
};

export default Earnings;

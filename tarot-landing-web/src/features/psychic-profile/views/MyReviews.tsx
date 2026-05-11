import React, { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { reviewsApi } from "../../browse/api/reviewsApi";
import type { Review, PsychicReviewSummary } from "../../browse/types/review.types";
import { useAuth } from "../../auth/hooks";

const MyReviews = () => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<PsychicReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const reviewsPerPage = 10;

  useEffect(() => {
    fetchReviews();
    fetchSummary();
  }, [currentPage]);

  const fetchReviews = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const skip = (currentPage - 1) * reviewsPerPage;
      const data = await reviewsApi.getPsychicReviews(user.id, skip, reviewsPerPage);
      setReviews(data);
    } catch (error) {
      console.error("Failed to fetch reviews:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    if (!user?.id) return;
    try {
      const data = await reviewsApi.getPsychicReviewSummary(user.id);
      setSummary(data);
    } catch (error) {
      console.error("Failed to fetch review summary:", error);
    }
  };

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

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Icon
        key={i}
        icon={i < rating ? "solar:star-bold" : "solar:star-outline"}
        className="text-xl"
        style={{ color: i < rating ? COLORS.starGold : COLORS.neutralGray }}
      />
    ));
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4.5) return "#4ADE80";
    if (rating >= 3.5) return COLORS.starGold;
    if (rating >= 2.5) return "#F59E0B";
    return "#F87171";
  };

  const totalPages = Math.ceil((summary?.total_reviews || 0) / reviewsPerPage);

  return (
    <div
      className="p-12 min-h-screen"
      style={{
        backgroundColor: COLORS.dark,
        fontFamily: TYPOGRAPHY.fontFamily.body,
      }}
    >
      {/* Header */}
      <div className="mb-12">
        <h1
          style={TYPOGRAPHY.headings.h2}
          className="uppercase italic tracking-tighter"
        >
          My <span style={{ color: COLORS.primary }}>Reviews</span>
        </h1>
        <p
          style={{ color: COLORS.neutralGray }}
          className="text-[10px] font-bold uppercase tracking-[0.5em] mt-2 opacity-50"
        >
          Client Feedback & Ratings
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        {/* Average Rating */}
        <div
          className="p-6 rounded-[24px] border border-white/5"
          style={{ backgroundColor: COLORS.surface }}
        >
          <div className="flex items-center justify-between mb-4">
            <Icon
              icon="solar:star-bold-duotone"
              className="text-3xl"
              style={{ color: COLORS.starGold }}
            />
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: COLORS.neutralGray }}
            >
              Average
            </span>
          </div>
          <div
            className="text-3xl font-black"
            style={{ color: getRatingColor(summary?.average_rating || 0) }}
          >
            {summary?.average_rating?.toFixed(1) || "0.0"}
          </div>
          <div className="flex gap-1 mt-2">
            {renderStars(Math.round(summary?.average_rating || 0))}
          </div>
        </div>

        {/* Total Reviews */}
        <div
          className="p-6 rounded-[24px] border border-white/5"
          style={{ backgroundColor: COLORS.surface }}
        >
          <div className="flex items-center justify-between mb-4">
            <Icon
              icon="solar:chat-round-line-bold-duotone"
              className="text-3xl"
              style={{ color: COLORS.primary }}
            />
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: COLORS.neutralGray }}
            >
              Total
            </span>
          </div>
          <div className="text-3xl font-black text-white">
            {summary?.total_reviews || 0}
          </div>
          <div
            className="text-[9px] font-black uppercase tracking-widest mt-1"
            style={{ color: COLORS.neutralGray }}
          >
            Reviews
          </div>
        </div>

        {/* 5-Star Reviews */}
        <div
          className="p-6 rounded-[24px] border border-white/5"
          style={{ backgroundColor: COLORS.surface }}
        >
          <div className="flex items-center justify-between mb-4">
            <Icon
              icon="solar:cup-star-bold-duotone"
              className="text-3xl"
              style={{ color: "#4ADE80" }}
            />
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: COLORS.neutralGray }}
            >
              5-Star
            </span>
          </div>
          <div className="text-3xl font-black" style={{ color: "#4ADE80" }}>
            {summary?.rating_distribution?.[5] || 0}
          </div>
          <div
            className="text-[9px] font-black uppercase tracking-widest mt-1"
            style={{ color: COLORS.neutralGray }}
          >
            Perfect Ratings
          </div>
        </div>

        {/* Rating Distribution */}
        <div
          className="p-6 rounded-[24px] border border-white/5"
          style={{ backgroundColor: COLORS.surface }}
        >
          <div className="flex items-center justify-between mb-4">
            <Icon
              icon="solar:chart-2-bold-duotone"
              className="text-3xl"
              style={{ color: COLORS.secondary }}
            />
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: COLORS.neutralGray }}
            >
              Distribution
            </span>
          </div>
          <div className="space-y-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary?.rating_distribution?.[star] || 0;
              const percentage = summary?.total_reviews
                ? (count / summary.total_reviews) * 100
                : 0;
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-white/40 w-3">
                    {star}
                  </span>
                  <div
                    className="flex-1 h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: COLORS.neutralDarkGray }}
                  >
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: COLORS.starGold,
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-black text-white/40 w-8 text-right">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reviews List */}
      <div
        className="rounded-[32px] border border-white/5 overflow-hidden"
        style={{ backgroundColor: COLORS.surface }}
      >
        <div className="p-6 border-b" style={{ borderColor: COLORS.neutralDarkGray }}>
          <h2
            className="text-lg font-black uppercase tracking-wider text-white"
          >
            Client Reviews
          </h2>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <Icon
              icon="solar:black-hole-line-duotone"
              className="text-4xl animate-spin"
              style={{ color: COLORS.primary }}
            />
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-12 text-center">
            <Icon
              icon="solar:chat-line-bold-duotone"
              className="text-5xl mx-auto mb-4"
              style={{ color: COLORS.neutralGray }}
            />
            <p className="text-white/40 text-sm">No reviews yet</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: COLORS.neutralDarkGray }}>
            {reviews.map((review) => (
              <div key={review.id} className="p-6 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: COLORS.surfaceAccent }}
                    >
                      <Icon
                        icon="solar:user-bold"
                        className="text-xl"
                        style={{ color: COLORS.primary }}
                      />
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">
                        {review.username || "Anonymous"}
                      </p>
                      <p
                        className="text-[9px] font-black uppercase tracking-widest"
                        style={{ color: COLORS.neutralGray }}
                      >
                        {formatDate(review.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {renderStars(review.rating)}
                  </div>
                </div>
                {review.comment && (
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: COLORS.neutralWhite }}
                  >
                    {review.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && reviews.length > 0 && totalPages > 1 && (
          <div className="p-6 border-t flex items-center justify-center gap-2" style={{ borderColor: COLORS.neutralDarkGray }}>
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
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  return (
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1
                  );
                })
                .map((page, idx, arr) => {
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
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((prev) => prev + 1)}
              className="p-2 rounded-xl transition-all hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <Icon
                icon="solar:alt-arrow-right-linear"
                className="text-white text-lg"
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyReviews;

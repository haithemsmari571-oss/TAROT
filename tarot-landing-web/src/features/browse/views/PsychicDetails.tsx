import { Icon } from "@iconify/react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { reviewsApi } from "../api/reviewsApi";
import { Review } from "../types/review.types";
import { requestChat } from "@/features/chat/api/chatApi";
import { useToast } from "@/components/Toast/useToast";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { usePsychicDetails, usePsychicReviewSummary, usePsychicReviews, useMyReviews, useChats } from "../hooks/usePsychicDetails";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import "../../../styles/starfield.css";



const PsychicDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const psychicId = id ? parseInt(id) : undefined;
  
  // TanStack Query hooks
  const { data: psychic, isLoading: psychicLoading, error: psychicError } = usePsychicDetails(psychicId);
  const { data: reviewSummary, isLoading: summaryLoading } = usePsychicReviewSummary(psychicId);
  const [reviewsPage, setReviewsPage] = useState(0);
  const [reviewsPerPage] = useState(5);
  const { data: reviews = [], isLoading: reviewsLoading } = usePsychicReviews(psychicId, reviewsPage, reviewsPerPage);
  const { data: myReviews = [] } = useMyReviews(!!user);
  const { data: chats = [] } = useChats(!!user);
  
  // Derived state
  const myReview = useMemo(() => {
    if (!psychicId || !myReviews.length) return null;
    return myReviews.find((review) => review.psychic_id === psychicId) || null;
  }, [myReviews, psychicId]);
  
  const chatWithPsychic = useMemo(() => {
    if (!psychicId || !chats.length) return null;
    return chats.find((chat) => chat.psychic_id === psychicId) || null;
  }, [chats, psychicId]);
  
  const totalReviews = reviewSummary?.total_reviews || 0;
  
  // Local state
  const [requestingChat, setRequestingChat] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(myReview?.rating || 5);
  const [reviewComment, setReviewComment] = useState(myReview?.comment || "");
  
  const loading = psychicLoading || summaryLoading || reviewsLoading;
  const error = psychicError ? "Failed to load psychic details. Please try again later." : null;

  // Convert price per second to price per minute
  const getPricePerMinute = (pricePerSecond: number) => {
    return (pricePerSecond * 60).toFixed(2);
  };

  // Update review form when myReview changes
  useEffect(() => {
    if (myReview) {
      setReviewRating(myReview.rating);
      setReviewComment(myReview.comment || "");
    }
  }, [myReview]);



  // Handle start reading (request chat)
  const handleStartReading = useCallback(async () => {
    if (!psychic || !user) {
      toast.error("Please log in to start a reading");
      navigate("/login");
      return;
    }

    try {
      setRequestingChat(true);
      
      await requestChat({
        psychic_id: psychic.id,
        message: "Hello, I'd like to start a reading.",
      });

      toast.success("Chat request sent! Redirecting...");
      
      // Navigate to the chat page
      setTimeout(() => {
        navigate("/chats");
      }, 1000);
    } catch (err: any) {
      console.error("Error requesting chat:", err);
      toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? "Failed to request chat. Please try again.");
    } finally {
      setRequestingChat(false);
    }
  }, [psychic, user, toast, navigate]);

  // Render star rating
  const renderStars = (rating: number, size: string = "text-base") => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Icon
          key={i}
          icon={i <= rating ? "ph:star-fill" : "ph:star"}
          className={size}
          style={{ color: i <= rating ? COLORS.primary : `${COLORS.neutralWhite}30` }}
        />
      );
    }
    return <div className="flex gap-1">{stars}</div>;
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { 
      year: "numeric", 
      month: "long", 
      day: "numeric" 
    });
  };

  // Navigate to chat with psychic
  const handleViewChatHistory = () => {
    navigate("/chats");
  };

  // Create review mutation
  const createReviewMutation = useMutation({
    mutationFn: (data: { psychic_id: number; rating: number; comment: string | null }) =>
      reviewsApi.createReview(data),
    onSuccess: () => {
      toast.success("Review submitted successfully!");
      queryClient.invalidateQueries({ queryKey: ["my-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["psychic-review-summary", psychicId] });
      queryClient.invalidateQueries({ queryKey: ["psychic-reviews", psychicId] });
      setReviewsPage(0);
      setShowReviewForm(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || "Failed to submit review");
    },
  });

  // Update review mutation
  const updateReviewMutation = useMutation({
    mutationFn: (data: { id: number; rating: number; comment: string | null }) =>
      reviewsApi.updateReview(data.id, { rating: data.rating, comment: data.comment }),
    onSuccess: () => {
      toast.success("Review updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["my-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["psychic-review-summary", psychicId] });
      queryClient.invalidateQueries({ queryKey: ["psychic-reviews", psychicId] });
      setShowReviewForm(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || "Failed to update review");
    },
  });

  // Handle review submission (create or update)
  const handleSubmitReview = () => {
    if (!psychic || !user) {
      toast.error("Please log in to leave a review");
      return;
    }

    if (reviewRating < 1 || reviewRating > 5) {
      toast.error("Rating must be between 1 and 5 stars");
      return;
    }

    if (myReview) {
      updateReviewMutation.mutate({
        id: myReview.id,
        rating: reviewRating,
        comment: reviewComment || null,
      });
    } else {
      createReviewMutation.mutate({
        psychic_id: psychic.id,
        rating: reviewRating,
        comment: reviewComment || null,
      });
    }
  };

  // Delete review mutation
  const deleteReviewMutation = useMutation({
    mutationFn: (reviewId: number) => reviewsApi.deleteReview(reviewId),
    onSuccess: () => {
      toast.success("Review deleted successfully!");
      setReviewRating(5);
      setReviewComment("");
      queryClient.invalidateQueries({ queryKey: ["my-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["psychic-review-summary", psychicId] });
      queryClient.invalidateQueries({ queryKey: ["psychic-reviews", psychicId] });
      
      // Check if we need to go back a page (if current page is now empty)
      const newTotal = totalReviews - 1;
      const maxPage = Math.ceil(newTotal / reviewsPerPage) - 1;
      const newPage = Math.min(reviewsPage, Math.max(0, maxPage));
      if (newPage !== reviewsPage) {
        setReviewsPage(newPage);
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || "Failed to delete review");
    },
  });

  // Handle review deletion
  const handleDeleteReview = () => {
    if (!myReview) return;

    if (!confirm("Are you sure you want to delete your review?")) return;

    deleteReviewMutation.mutate(myReview.id);
  };

  // Group availability by day
  const groupedAvailability = psychic?.availability.reduce((acc, slot) => {
    const day = slot.day_of_the_week;
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(slot);
    return acc;
  }, {} as Record<string, typeof psychic.availability>);

  // Sort days of week
  const daysOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const sortedDays = groupedAvailability
    ? Object.keys(groupedAvailability).sort((a, b) => daysOrder.indexOf(a) - daysOrder.indexOf(b))
    : [];

  // LOADING STATE
  if (loading) {
    return (
      <div className="min-h-screen pt-32 pb-20" style={{ backgroundColor: COLORS.dark }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center py-20">
            <Icon icon="ph:spinner" className="text-6xl mb-4 animate-spin mx-auto" style={{ color: COLORS.primary }} />
            <p className="text-lg opacity-60" style={{ color: COLORS.neutralWhite }}>
              Loading psychic details...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ERROR STATE
  if (error || !psychic) {
    return (
      <div className="min-h-screen pt-32 pb-20" style={{ backgroundColor: COLORS.dark }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center py-20">
            <Icon icon="ph:warning" className="text-6xl mb-4 mx-auto" style={{ color: COLORS.primary }} />
            <p className="text-lg opacity-60 mb-4" style={{ color: COLORS.neutralWhite }}>
              {error || "Psychic not found"}
            </p>
            <button
              onClick={() => navigate("/psychics-browse")}
              className="px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider"
              style={{
                backgroundColor: COLORS.primary,
                color: COLORS.dark,
              }}
            >
              Back to Browse
            </button>
          </div>
        </div>
      </div>
    );
  }

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
        {/* BACK BUTTON */}
        <button
          onClick={() => navigate("/psychics-browse")}
          className="mb-6 sm:mb-8 flex items-center gap-2 text-sm font-medium opacity-60 hover:opacity-100 transition-opacity"
          style={{ color: COLORS.neutralWhite }}
        >
          <Icon icon="ph:arrow-left" className="text-lg" />
          Back to Browse
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* LEFT COLUMN - PSYCHIC INFO */}
          <div className="lg:col-span-1">
            <div
              className="rounded-2xl p-4 sm:p-6 sticky top-32"
              style={{
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.neutralWhite}10`,
              }}
            >
              {/* PROFILE IMAGE */}
              <div className="relative h-64 sm:h-80 w-full overflow-hidden rounded-xl mb-6">
                {psychic.profile_picture_url ? (
                  <>
                    <img
                      src={psychic.profile_picture_url}
                      alt={psychic.username}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-surface/80 via-transparent to-transparent" />
                  </>
                ) : (
                  <div 
                    className="w-full h-full flex items-center justify-center"
                    style={{ 
                      background: `linear-gradient(135deg, ${COLORS.surface} 0%, ${COLORS.surfaceAccent} 100%)` 
                    }}
                  >
                    <svg
                      width="160"
                      height="160"
                      viewBox="0 0 160 160"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Mystical circles */}
                      <circle
                        cx="80"
                        cy="80"
                        r="75"
                        stroke={COLORS.primary}
                        strokeWidth="2"
                        strokeOpacity="0.3"
                        fill="none"
                      />
                      <circle
                        cx="80"
                        cy="80"
                        r="68"
                        stroke={COLORS.primary}
                        strokeWidth="1"
                        strokeOpacity="0.2"
                        fill="none"
                      />
                      
                      {/* User icon */}
                      <circle
                        cx="80"
                        cy="60"
                        r="20"
                        fill={COLORS.primary}
                        opacity="0.3"
                      />
                      <path
                        d="M 40 120 Q 40 85 80 85 Q 120 85 120 120"
                        fill={COLORS.primary}
                        opacity="0.3"
                      />
                      
                      {/* Mystical stars and elements */}
                      <path
                        d="M 80 25 L 83 33 L 91 33 L 85 38 L 88 46 L 80 41 L 72 46 L 75 38 L 69 33 L 77 33 Z"
                        fill={COLORS.primary}
                        opacity="0.4"
                      />
                      <circle cx="30" cy="50" r="2.5" fill={COLORS.primary} opacity="0.3" />
                      <circle cx="130" cy="50" r="2.5" fill={COLORS.primary} opacity="0.3" />
                      <circle cx="25" cy="100" r="2" fill={COLORS.primary} opacity="0.3" />
                      <circle cx="135" cy="100" r="2" fill={COLORS.primary} opacity="0.3" />
                      <circle cx="40" cy="140" r="1.5" fill={COLORS.primary} opacity="0.25" />
                      <circle cx="120" cy="140" r="1.5" fill={COLORS.primary} opacity="0.25" />
                    </svg>
                  </div>
                )}
                
                {/* ONLINE STATUS */}
                {psychic.is_online && (
                  <div className="absolute top-4 right-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-xs uppercase font-bold tracking-widest text-white">Online</span>
                  </div>
                )}
              </div>

              {/* NAME */}
              <h1
                className="uppercase tracking-tight text-2xl sm:text-3xl mb-4"
                style={{ ...TYPOGRAPHY.headings.h2, color: COLORS.neutralWhite }}
              >
                {psychic.username}
              </h1>

              {/* RATING SUMMARY */}
              {reviewSummary && reviewSummary.total_reviews > 0 && (
                <div className="mb-6 p-4 rounded-xl" style={{ backgroundColor: `${COLORS.neutralWhite}05` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {renderStars(Math.round(reviewSummary.average_rating), "text-xl")}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold" style={{ color: COLORS.primary }}>
                        {reviewSummary.average_rating.toFixed(1)}
                      </div>
                      <div className="text-xs opacity-60" style={{ color: COLORS.neutralWhite }}>
                        {reviewSummary.total_reviews} {reviewSummary.total_reviews === 1 ? "review" : "reviews"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SPECIALTIES */}
              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-widest mb-3" style={{ color: COLORS.neutralWhite + "80" }}>
                  Specialties
                </label>
                <div className="flex flex-wrap gap-2">
                  {psychic.categories.map((category) => (
                    <span
                      key={category.id}
                      className="px-3 py-1.5 rounded-full text-xs uppercase font-bold"
                      style={{
                        backgroundColor: `${COLORS.primary}20`,
                        color: COLORS.primary,
                        border: `1px solid ${COLORS.primary}40`,
                      }}
                    >
                      {category.title}
                    </span>
                  ))}
                </div>
              </div>

              {/* PRICE */}
              <div className="mb-6 p-4 rounded-xl border" style={{ 
                backgroundColor: `${COLORS.primary}10`,
                borderColor: COLORS.primary 
              }}>
                <div className="text-xs uppercase font-bold tracking-widest mb-1 opacity-80" style={{ color: COLORS.neutralWhite }}>
                  Price
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black" style={{ color: COLORS.primary }}>
                    ${getPricePerMinute(psychic.price_per_second)}
                  </span>
                  <span className="text-sm uppercase font-bold opacity-60" style={{ color: COLORS.neutralWhite }}>
                    per minute
                  </span>
                </div>
              </div>

              {/* START READING BUTTON */}
              <button
                onClick={handleStartReading}
                disabled={requestingChat || !psychic.is_online}
                className="w-full py-4 rounded-xl flex items-center justify-center gap-3 mb-3 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: psychic.is_online ? COLORS.primary : `${COLORS.neutralWhite}20`,
                  fontFamily: TYPOGRAPHY.fontFamily.heading,
                }}
              >
                {requestingChat ? (
                  <>
                    <Icon icon="ph:spinner" className="text-xl animate-spin" style={{ color: COLORS.dark }} />
                    <span className="text-sm font-black uppercase tracking-wider" style={{ color: COLORS.dark }}>
                      Requesting...
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-black uppercase tracking-wider" style={{ color: COLORS.dark }}>
                    Start Reading
                  </span>
                )}
              </button>
              
              {!psychic.is_online && (
                <p className="text-xs text-center opacity-60" style={{ color: COLORS.neutralWhite }}>
                  This psychic is currently offline
                </p>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN - BIO & REVIEWS */}
          <div className="lg:col-span-2 space-y-8">
            {/* BIO SECTION */}
            <div
              className="rounded-2xl p-4 sm:p-6 lg:p-8"
              style={{
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.neutralWhite}10`,
              }}
            >
              <h2
                className="uppercase tracking-tight text-xl sm:text-2xl mb-4"
                style={{ ...TYPOGRAPHY.headings.h3, color: COLORS.neutralWhite }}
              >
                About
              </h2>
              <p className="text-base leading-relaxed opacity-80 italic" style={{ color: COLORS.neutralWhite }}>
                "{psychic.bio}"
              </p>
            </div>

            {/* AVAILABILITY SECTION */}
            {psychic.availability.length > 0 && (
              <div
                className="rounded-2xl p-4 sm:p-6 lg:p-8"
                style={{
                  backgroundColor: COLORS.surface,
                  border: `1px solid ${COLORS.neutralWhite}10`,
                }}
              >
                <h2
                  className="uppercase tracking-tight text-xl sm:text-2xl mb-4 sm:mb-6"
                  style={{ ...TYPOGRAPHY.headings.h3, color: COLORS.neutralWhite }}
                >
                  Availability
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sortedDays.map((day) => (
                    <div
                      key={day}
                      className="p-4 rounded-xl"
                      style={{ backgroundColor: `${COLORS.neutralWhite}05` }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Icon icon="ph:calendar" className="text-lg" style={{ color: COLORS.primary }} />
                        <span className="font-bold uppercase text-sm" style={{ color: COLORS.neutralWhite }}>
                          {day}
                        </span>
                      </div>
                      <div className="space-y-2 pl-6">
                        {groupedAvailability[day].map((slot) => (
                          <div
                            key={slot.id}
                            className="flex items-center gap-2 text-sm opacity-80"
                            style={{ color: COLORS.neutralWhite }}
                          >
                            <Icon icon="ph:clock" className="text-base" style={{ color: COLORS.primary }} />
                            <span>
                              {slot.start_at} - {slot.end_at}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CHAT HISTORY SECTION */}
            {chatWithPsychic && (
              <div
                className="rounded-2xl p-4 sm:p-6 lg:p-8"
                style={{
                  backgroundColor: COLORS.surface,
                  border: `1px solid ${COLORS.neutralWhite}10`,
                }}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <h2
                    className="uppercase tracking-tight text-xl sm:text-2xl"
                    style={{ ...TYPOGRAPHY.headings.h3, color: COLORS.neutralWhite }}
                  >
                    Chat History
                  </h2>
                  <button
                    onClick={handleViewChatHistory}
                    className="px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
                    style={{
                      backgroundColor: `${COLORS.primary}20`,
                      color: COLORS.primary,
                      border: `1px solid ${COLORS.primary}40`,
                    }}
                  >
                    <Icon icon="ph:chat-text" className="text-base" />
                    View Chat
                  </button>
                </div>
                <p className="text-sm opacity-60" style={{ color: COLORS.neutralWhite }}>
                  You have an existing conversation with {psychic.username}. Click above to view your chat history.
                </p>
              </div>
            )}

            {/* REVIEW FORM SECTION */}
            {user && chatWithPsychic && (
              <div
                className="rounded-2xl p-4 sm:p-6 lg:p-8"
                style={{
                  backgroundColor: COLORS.surface,
                  border: `1px solid ${COLORS.neutralWhite}10`,
                }}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
                  <h2
                    className="uppercase tracking-tight text-xl sm:text-2xl"
                    style={{ ...TYPOGRAPHY.headings.h3, color: COLORS.neutralWhite }}
                  >
                    {myReview ? "Your Review" : "Leave a Review"}
                  </h2>
                  {!showReviewForm && myReview && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowReviewForm(true)}
                        className="px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: `${COLORS.primary}20`,
                          color: COLORS.primary,
                          border: `1px solid ${COLORS.primary}40`,
                        }}
                      >
                        <Icon icon="ph:pencil" className="text-base" />
                        Edit
                      </button>
                      <button
                        onClick={handleDeleteReview}
                        className="px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: `${COLORS.neutralWhite}10`,
                          color: COLORS.neutralWhite,
                        }}
                      >
                        <Icon icon="ph:trash" className="text-base" />
                        Delete
                      </button>
                    </div>
                  )}
                  {!showReviewForm && !myReview && (
                    <button
                      onClick={() => setShowReviewForm(true)}
                      className="px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor: `${COLORS.primary}20`,
                        color: COLORS.primary,
                        border: `1px solid ${COLORS.primary}40`,
                      }}
                    >
                      <Icon icon="ph:star" className="text-base" />
                      Write Review
                    </button>
                  )}
                </div>

                {!showReviewForm && myReview ? (
                  <div className="p-4 sm:p-6 rounded-xl" style={{ backgroundColor: `${COLORS.neutralWhite}05` }}>
                    <div className="flex items-center gap-3 mb-4">
                      {renderStars(myReview.rating, "text-xl")}
                    </div>
                    {myReview.comment && (
                      <p className="text-sm leading-relaxed opacity-80" style={{ color: COLORS.neutralWhite }}>
                        {myReview.comment}
                      </p>
                    )}
                    <p className="text-xs opacity-60 mt-4" style={{ color: COLORS.neutralWhite }}>
                      Posted on {formatDate(myReview.created_at)}
                    </p>
                  </div>
                ) : showReviewForm ? (
                  <div className="space-y-6">
                    {/* Star Rating */}
                    <div>
                      <label className="block text-sm font-bold uppercase tracking-widest mb-3" style={{ color: COLORS.neutralWhite + "80" }}>
                        Rating
                      </label>
                      <div className="flex gap-1 sm:gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => setReviewRating(star)}
                            className="text-3xl sm:text-4xl transition-transform hover:scale-110"
                          >
                            <Icon
                              icon={star <= reviewRating ? "ph:star-fill" : "ph:star"}
                              style={{ color: star <= reviewRating ? COLORS.primary : `${COLORS.neutralWhite}30` }}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Comment */}
                    <div>
                      <label className="block text-sm font-bold uppercase tracking-widest mb-3" style={{ color: COLORS.neutralWhite + "80" }}>
                        Comment (Optional)
                      </label>
                      <textarea
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        maxLength={1000}
                        rows={4}
                        placeholder="Share your experience..."
                        className="w-full px-4 py-3 rounded-xl text-sm resize-none"
                        style={{
                          backgroundColor: `${COLORS.neutralWhite}05`,
                          border: `1px solid ${COLORS.neutralWhite}10`,
                          color: COLORS.neutralWhite,
                        }}
                      />
                      <p className="text-xs opacity-60 mt-2" style={{ color: COLORS.neutralWhite }}>
                        {reviewComment.length}/1000 characters
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={handleSubmitReview}
                        disabled={createReviewMutation.isPending || updateReviewMutation.isPending}
                        className="w-full sm:flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wider disabled:opacity-50 transition-opacity hover:opacity-90"
                        style={{
                          backgroundColor: COLORS.primary,
                          color: COLORS.dark,
                        }}
                      >
                        {createReviewMutation.isPending || updateReviewMutation.isPending ? (
                          <span className="flex items-center justify-center gap-2">
                            <Icon icon="ph:spinner" className="text-base animate-spin" />
                            Submitting...
                          </span>
                        ) : (
                          <span>{myReview ? "Update Review" : "Submit Review"}</span>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setShowReviewForm(false);
                          if (myReview) {
                            setReviewRating(myReview.rating);
                            setReviewComment(myReview.comment || "");
                          } else {
                            setReviewRating(5);
                            setReviewComment("");
                          }
                        }}
                        className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: `${COLORS.neutralWhite}10`,
                          color: COLORS.neutralWhite,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm opacity-60 text-center py-6" style={{ color: COLORS.neutralWhite }}>
                    You haven't reviewed this psychic yet. Click "Write Review" to share your experience.
                  </p>
                )}
              </div>
            )}

            {/* REVIEWS SECTION */}
            <div
              className="rounded-2xl p-4 sm:p-6 lg:p-8"
              style={{
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.neutralWhite}10`,
              }}
            >
              <h2
                className="uppercase tracking-tight text-xl sm:text-2xl mb-4 sm:mb-6"
                style={{ ...TYPOGRAPHY.headings.h3, color: COLORS.neutralWhite }}
              >
                Reviews ({totalReviews})
              </h2>

              {totalReviews === 0 ? (
                <div className="text-center py-12">
                  <Icon icon="ph:chat-text" className="text-5xl mb-4 mx-auto opacity-30" style={{ color: COLORS.neutralWhite }} />
                  <p className="text-base opacity-60" style={{ color: COLORS.neutralWhite }}>
                    No reviews yet
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-6">
                    {reviews.map((review) => (
                      <div
                        key={review.id}
                        className="p-4 sm:p-6 rounded-xl border"
                        style={{
                          backgroundColor: `${COLORS.neutralWhite}05`,
                          borderColor: `${COLORS.neutralWhite}10`,
                        }}
                      >
                        {/* REVIEW HEADER */}
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-bold text-sm" style={{ color: COLORS.neutralWhite }}>
                                {review.username || "Anonymous"}
                              </span>
                              {renderStars(review.rating, "text-sm")}
                            </div>
                            <span className="text-xs opacity-60" style={{ color: COLORS.neutralWhite }}>
                              {formatDate(review.created_at)}
                            </span>
                          </div>
                        </div>

                        {/* REVIEW COMMENT */}
                        {review.comment && (
                          <p className="text-sm leading-relaxed opacity-80" style={{ color: COLORS.neutralWhite }}>
                            {review.comment}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* PAGINATION CONTROLS */}
                  {totalReviews > reviewsPerPage && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pt-6 border-t" style={{ borderColor: `${COLORS.neutralWhite}10` }}>
                      <div className="text-xs sm:text-sm opacity-60" style={{ color: COLORS.neutralWhite }}>
                        Showing {reviewsPage * reviewsPerPage + 1}-{Math.min((reviewsPage + 1) * reviewsPerPage, totalReviews)} of {totalReviews}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setReviewsPage((prev) => Math.max(0, prev - 1))}
                          disabled={reviewsPage === 0}
                          className="px-3 sm:px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed transition-opacity hover:opacity-80"
                          style={{
                            backgroundColor: `${COLORS.neutralWhite}10`,
                            color: COLORS.neutralWhite,
                          }}
                        >
                          <Icon icon="ph:caret-left" className="text-lg" />
                        </button>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          {Array.from({ length: Math.ceil(totalReviews / reviewsPerPage) }).map((_, index) => (
                            <button
                              key={index}
                              onClick={() => setReviewsPage(index)}
                              className="w-9 sm:w-8 h-9 sm:h-8 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                              style={{
                                backgroundColor: reviewsPage === index ? COLORS.primary : `${COLORS.neutralWhite}10`,
                                color: reviewsPage === index ? COLORS.dark : COLORS.neutralWhite,
                              }}
                            >
                              {index + 1}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setReviewsPage((prev) => Math.min(Math.ceil(totalReviews / reviewsPerPage) - 1, prev + 1))}
                          disabled={reviewsPage >= Math.ceil(totalReviews / reviewsPerPage) - 1}
                          className="px-3 sm:px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed transition-opacity hover:opacity-80"
                          style={{
                            backgroundColor: `${COLORS.neutralWhite}10`,
                            color: COLORS.neutralWhite,
                          }}
                        >
                          <Icon icon="ph:caret-right" className="text-lg" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PsychicDetails;

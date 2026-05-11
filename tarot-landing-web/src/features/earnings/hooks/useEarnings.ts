import { useState, useCallback } from "react";
import { earningsApi } from "../api/earningsApi";
import type {
  EarningsListResponse,
  EarningsFilters,
  EarningsSummary,
} from "../types/earnings.types";

export const useEarnings = () => {
  const [earnings, setEarnings] = useState<EarningsListResponse | null>(null);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch earnings
  const fetchEarnings = useCallback(async (filters?: EarningsFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await earningsApi.getMyEarnings(filters);
      setEarnings(data);
      return data;
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail || "Failed to fetch earnings";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch earnings summary
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await earningsApi.getEarningsSummary();
      setSummary(data);
      return data;
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail || "Failed to fetch earnings summary";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    earnings,
    summary,
    loading,
    error,
    fetchEarnings,
    fetchSummary,
  };
};

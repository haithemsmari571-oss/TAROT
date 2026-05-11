import { useState, useEffect } from "react";
import { psychicsApi } from "../api/psychicsApi";
import { Psychic, PsychicFilters } from "../types/psychic.types";

export const usePsychics = (filters?: PsychicFilters) => {
  const [psychics, setPsychics] = useState<Psychic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPsychics = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await psychicsApi.getPsychics(filters);
        setPsychics(data);
      } catch (err) {
        console.error("Error fetching psychics:", err);
        setError("Failed to load psychics. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchPsychics();
  }, [filters]);

  return { psychics, loading, error };
};

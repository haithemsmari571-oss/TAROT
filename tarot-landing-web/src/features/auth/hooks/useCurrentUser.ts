import { useQuery } from "@tanstack/react-query";
import { getCurrentUser } from "../api";
import { useAuth } from "./useAuth";
import { useEffect } from "react";

export const useCurrentUser = () => {
  const { token, setUser } = useAuth();

  const query = useQuery({
    queryKey: ["currentUser"],
    queryFn: getCurrentUser,
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (query.data) {
      setUser(query.data);
    }
  }, [query.data, setUser]);

  return query;
};

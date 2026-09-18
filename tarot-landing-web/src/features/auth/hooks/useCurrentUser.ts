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

  // Only while signed in: after logout the cached /auth/me answer is still
  // here, and setUser would write it back to localStorage (auth_user).
  useEffect(() => {
    if (token && query.data) {
      setUser(query.data);
    }
  }, [token, query.data, setUser]);

  return query;
};

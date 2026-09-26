import { useQuery } from "@tanstack/react-query";
import { getCurrentUser } from "../api";
import { useAuth } from "./useAuth";
import { useEffect } from "react";

/** The signed-in user's /profile/me answer. Whoever changes the profile
 *  writes the fresh answer here (ClientEditDetailsScreen.tsx), and the effect
 *  below carries it into the auth context. */
export const CURRENT_USER_QUERY_KEY = ["currentUser"] as const;

export const useCurrentUser = () => {
  const { token, setUser } = useAuth();

  const query = useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
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

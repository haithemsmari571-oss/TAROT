import { createContext, useState, useEffect, useMemo, type ReactNode } from "react";
import {
  getToken,
  saveToken,
  clearTokens,
  isTokenExpired,
  getUser,
  saveUser,
  saveRefreshToken,
} from "../utils";
import type { User, AuthContextType } from "../types";
import { getCurrentUser } from "../api";
import { fillStoredUser, storedSessionStart, tokenSignsInHere } from "../websiteSignIn";

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = () => {
      const storedToken = getToken();
      const storedUser = getUser();

      if (storedToken && storedUser) {
        if (isTokenExpired(storedToken)) {
          console.log("Token expired on init, clearing auth");
          clearTokens();
          setToken(null);
          setUser(null);
        } else {
          console.log("Restoring auth from localStorage");
          setToken(storedToken);
          setUser(storedUser);
        }
      } else if (storedToken && !storedUser) {
        // A session stored without its user, as the CRM on this host stores
        // its sign-in: kept when it signs in here, and the user read from
        // /profile/me (websiteSignIn.ts storedSessionStart).
        if (storedSessionStart(storedToken, false) === "fill-user") {
          console.log("Token without user data, filling the user from /profile/me");
          fillStoredUser(getCurrentUser).then((filled) => {
            // getToken(): the read may have refreshed the token.
            setToken(filled ? getToken() : null);
            setUser(filled);
            setIsLoading(false);
          });
          return;
        }
        // Token exists but no user data - clear everything
        console.log("Token exists but no user data, clearing auth");
        clearTokens();
        setToken(null);
        setUser(null);
      }

      setIsLoading(false);
    };

    initAuth();
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "auth_token") {
        // A reader's or admin's token stored by another tab is not adopted:
        // the website refuses those sessions (websiteSignIn.ts).
        if (e.newValue === null || !tokenSignsInHere(e.newValue)) {
          console.log("Token removed from storage, logging out");
          setToken(null);
          setUser(null);
        } else {
          console.log("Token updated in storage");
          setToken(e.newValue);
        }
      }
      if (e.key === "auth_user") {
        if (e.newValue === null) {
          setUser(null);
        } else {
          try {
            setUser(JSON.parse(e.newValue));
          } catch (error) {
            console.error("Failed to parse user from storage event:", error);
          }
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const login = (newToken: string, newUser: User, refreshToken?: string) => {
    console.log("Login called, saving tokens and user");
    saveToken(newToken);
    saveUser(newUser);
    if (refreshToken) {
      saveRefreshToken(refreshToken);
    }
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    clearTokens();
    setToken(null);
    setUser(null);
  };

  const updateUser = (newUser: User) => {
    saveUser(newUser);
    setUser(newUser);
  };

  // Memoized so the context value is stable across re-renders — consumers (esp.
  // the notification socket, keyed on token) don't churn when only `user`'s
  // identity changes from a background /auth/me refetch.
  const value: AuthContextType = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!token && !!user,
      isLoading,
      login,
      logout,
      setUser: updateUser,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, token, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

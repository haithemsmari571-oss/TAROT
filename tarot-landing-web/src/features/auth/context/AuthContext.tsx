import {
  createContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { 
  getToken, 
  saveToken, 
  clearTokens, 
  isTokenExpired, 
  getUser, 
  saveUser,
  saveRefreshToken 
} from "../utils";
import type { User, AuthContextType } from "../types";

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
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
        if (e.newValue === null) {
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

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout,
    setUser: updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

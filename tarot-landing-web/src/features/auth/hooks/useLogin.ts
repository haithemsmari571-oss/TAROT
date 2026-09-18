import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { signIn } from "../api";
import axiosClient from "@/lib/axiosClient";
import { useAuth } from "./useAuth";
import { UserRole } from "../types/auth.types";
import type { LoginRequest, User } from "../types";
import { decodeToken } from "../utils/tokenStorage";
import { HOME_PATH } from "@/features/client-app/clientAppPaths";

export const useLogin = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const response = await signIn(credentials);

      // Decode JWT to get the role
      const decodedToken = decodeToken(response.access_token);
      if (!decodedToken) {
        throw new Error("Failed to decode token");
      }

      const userResponse = await axiosClient.get<User>("/profile/me", {
        headers: {
          Authorization: `Bearer ${response.access_token}`,
        },
      });

      return {
        token: response.access_token,
        refreshToken: response.refresh_token,
        user: userResponse.data,
        role: decodedToken.role
      };
    },
    onSuccess: (data) => {
      login(data.token, data.user, data.refreshToken);

      console.log("Login success - Role from JWT:", data.role);
      console.log("Login success - User role:", data.user.role);
      console.log("UserRole enum:", UserRole);

      // Redirect based on user role from JWT
      if (data.role === UserRole.PSYCHIC) {
        console.log("Redirecting to /admin/earnings");
        navigate("/admin/earnings");
      } else if (data.role === UserRole.SUPERADMIN) {
        window.location.assign("/crm/#/control");
      } else if (data.role === UserRole.ADMIN) {
        console.log("Redirecting to /admin/chats");
        navigate("/admin/chats");
      } else if (data.role === UserRole.USER) {
        // Clients land in the app
        navigate(HOME_PATH);
      } else {
        // Fallback to psychics browse
        navigate("/psychics-browse");
      }
    },
    onError: (error: any) => {
      console.error("Login failed:", error);
    },
  });
};

import { useMutation } from "@tanstack/react-query";
import { trackEvent } from "@/features/analytics/analytics";
import { signUp } from "../api";
import type { RegisterRequest } from "../types";

export const useRegister = () => {
  return useMutation({
    mutationFn: (userData: RegisterRequest) => signUp(userData),
    // The server has created the account: counted once (analytics.ts).
    onSuccess: () => trackEvent("signup_completed"),
    onError: (error: any) => {
      console.error("Registration failed:", error);
    },
  });
};

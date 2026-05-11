import { useMutation } from "@tanstack/react-query";
import { forgotPassword } from "../api";
import type { ForgotPasswordRequest } from "../types";

export const useForgotPassword = () => {
  return useMutation({
    mutationFn: (data: ForgotPasswordRequest) => forgotPassword(data),
    onError: (error: any) => {
      console.error("Forgot password failed:", error);
    },
  });
};

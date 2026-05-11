import { useMutation } from "@tanstack/react-query";
import { resendVerifyEmail } from "../api";

export const useResendVerify = () => {
  return useMutation({
    mutationFn: (email: string) => resendVerifyEmail(email),
    onError: (error: any) => {
      console.error("Resend verification failed:", error);
    },
  });
};

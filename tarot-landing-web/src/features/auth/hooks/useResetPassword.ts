import { useMutation } from "@tanstack/react-query";
import { resetPassword } from "../api";
import type { ResetPasswordRequest } from "../types";

// On success the page shows its own "Password reset successful" panel with its
// link to sign in (reset-password.tsx). Moving to /login at once left her with
// no word that the new password was saved.
export const useResetPassword = () => {
  return useMutation({
    mutationFn: (data: ResetPasswordRequest) => resetPassword(data),
    onError: (error: any) => {
      console.error("Reset password failed:", error);
    },
  });
};

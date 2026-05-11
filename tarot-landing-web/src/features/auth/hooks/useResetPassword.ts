import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { resetPassword } from "../api";
import type { ResetPasswordRequest } from "../types";

export const useResetPassword = () => {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: ResetPasswordRequest) => resetPassword(data),
    onSuccess: () => {
      navigate("/login");
    },
    onError: (error: any) => {
      console.error("Reset password failed:", error);
    },
  });
};

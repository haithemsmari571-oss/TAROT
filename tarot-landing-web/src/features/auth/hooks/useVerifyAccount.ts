import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { verifyAccount } from "../api";

export const useVerifyAccount = () => {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (token: string) => verifyAccount(token),
    onSuccess: () => {
      setTimeout(() => navigate("/login?verified=true"), 2000);
    },
    onError: (error: any) => {
      console.error("Account verification failed:", error);
    },
  });
};

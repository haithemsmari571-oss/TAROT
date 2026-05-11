import { useMutation } from "@tanstack/react-query";
import { signUp } from "../api";
import type { RegisterRequest } from "../types";

export const useRegister = () => {
  return useMutation({
    mutationFn: (userData: RegisterRequest) => signUp(userData),
    onError: (error: any) => {
      console.error("Registration failed:", error);
    },
  });
};

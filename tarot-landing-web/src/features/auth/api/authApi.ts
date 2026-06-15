import axiosClient from "@/lib/axiosClient";
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  User,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  VerifyAccountResponse,
  ResendVerifyRequest,
  ResendVerifyResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
} from "../types";

export const signIn = async (
  credentials: LoginRequest
): Promise<LoginResponse> => {
  const response = await axiosClient.post<LoginResponse>(
    "/auth/sign-in",
    credentials
  );
  return response.data;
};

export const signUp = async (
  userData: RegisterRequest
): Promise<RegisterResponse> => {
  const response = await axiosClient.post<RegisterResponse>(
    "/auth/sign-up",
    userData
  );
  return response.data;
};

export const getCurrentUser = async (): Promise<User> => {
  const response = await axiosClient.get<User>("/profile/me");
  return response.data;
};

export const verifyAccount = async (
  token: string
): Promise<VerifyAccountResponse> => {
  // Backend verifies via GET and redirects back to the frontend with ?status=success|error
  window.location.href = `${import.meta.env.VITE_API_URL}/auth/verify-account/${token}`;
  return { message: "Redirecting to verify your account..." };
};

export const resendVerifyEmail = async (
  email: string
): Promise<ResendVerifyResponse> => {
  const response = await axiosClient.post<ResendVerifyResponse>(
    "/auth/resend-verify-email",
    { email }
  );
  return response.data;
};

export const forgotPassword = async (
  data: ForgotPasswordRequest
): Promise<ForgotPasswordResponse> => {
  const response = await axiosClient.post<ForgotPasswordResponse>(
    "/auth/forgot-password",
    data
  );
  return response.data;
};

export const resetPassword = async (
  data: ResetPasswordRequest
): Promise<void> => {
  await axiosClient.post("/auth/reset-password", data);
};

export const updateProfile = async (data: Partial<User>): Promise<User> => {
  const response = await axiosClient.patch<User>("/profile/me", data);
  return response.data;
};

export const refreshToken = async (
  refreshToken: string
): Promise<RefreshTokenResponse> => {
  const response = await axiosClient.post<RefreshTokenResponse>(
    "/auth/refresh-token",
    { refresh_token: refreshToken }
  );
  return response.data;
};

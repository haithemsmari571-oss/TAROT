export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  message: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  is_verified: boolean;
  role: UserRole;
  bio?: string;
  profile_picture?: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export enum UserRole {
  USER = "USER",
  PSYCHIC = "PSYCHIC",
  ADMIN = "ADMIN",
  SUPERADMIN = "SUPERADMIN",
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordRequest {
  reset_token: string;
  new_password: string;
}

export interface VerifyAccountRequest {
  token: string;
}

export interface VerifyAccountResponse {
  message: string;
}

export interface ResendVerifyRequest {
  email: string;
}

export interface ResendVerifyResponse {
  message: string;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
}

export interface ApiError {
  message: string;
  detail?: string;
  status?: number;
}

export interface JWTPayload {
  sub: string;
  role: UserRole;
  exp: number;
}

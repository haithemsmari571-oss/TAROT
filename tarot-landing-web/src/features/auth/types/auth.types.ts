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

export enum Permission {
  MANAGE_USERS = "manage_users",
  MANAGE_PSYCHICS = "manage_psychics",
  MANAGE_TRANSACTIONS = "manage_transactions",
  MANAGE_ZODIAC = "manage_zodiac",
  MANAGE_BUY_OPTIONS = "manage_buy_options",
  MANAGE_SETTINGS = "manage_settings",
  VIEW_EARNINGS = "view_earnings",
  VIEW_TRANSACTIONS = "view_transactions",
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPERADMIN]: Object.values(Permission),
  [UserRole.ADMIN]: [
    Permission.MANAGE_USERS,
    Permission.MANAGE_PSYCHICS,
    Permission.MANAGE_TRANSACTIONS,
    Permission.MANAGE_ZODIAC,
    Permission.MANAGE_BUY_OPTIONS,
    Permission.MANAGE_SETTINGS,
    Permission.VIEW_TRANSACTIONS,
  ],
  [UserRole.PSYCHIC]: [Permission.VIEW_EARNINGS],
  [UserRole.USER]: [],
};

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

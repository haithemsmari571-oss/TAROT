// User types matching backend API schemas

export enum Role {
  USER = "USER",
  ADMIN = "ADMIN",
  SUPERADMIN = "SUPERADMIN",
  PSYCHIC = "PSYCHIC",
}

export enum UserStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
}

// Main user interface for list view
export interface AdminUserListItem {
  id: number;
  username: string;
  email: string;
  role: Role;
  balance: number;
  is_verified: boolean;
  is_online: boolean;
  status: UserStatus;
  created_at: string;
  profile_picture_path?: string;
}

// Detailed user interface
export interface AdminUserDetail extends AdminUserListItem {
  bio?: string;
  price_per_second?: number;
  updated_at: string;
}

// Paginated response
export interface AdminUserListResponse {
  users: AdminUserListItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// Filter parameters for user list
export interface UserFilters {
  search?: string;
  role?: Role;
  status?: UserStatus;
  is_verified?: boolean;
  page?: number;
  limit?: number;
  sort_by?: "created_at" | "username" | "email" | "balance";
  sort_order?: "asc" | "desc";
}

// Create user payload
export interface AdminUserCreate {
  username: string;
  email: string;
  password: string;
  role?: Role;
  balance?: number;
  is_verified?: boolean;
  bio?: string;
  price_per_second?: number;
}

// Update user payload
export interface AdminUserUpdate {
  username?: string;
  email?: string;
  password?: string;
  balance?: number;
  bio?: string;
  price_per_second?: number;
  is_verified?: boolean;
  status?: UserStatus;
}

// Role update payload
export interface UserRoleUpdate {
  role: Role;
}

// Balance adjustment payload
export interface AdminBalanceAdjustment {
  amount: number;
  reason: string;
}

// Gift balance payload
export interface GiftBalancePayload {
  amount: number;
  message: string;
}

import axios from "axios";
import axiosClient from "@/lib/axiosClient";
import { signIn } from "@/features/auth/api";
import { UserRole, type User } from "@/features/auth/types/auth.types";
import { decodeToken, getRefreshToken, getToken, isTokenExpired } from "@/features/auth/utils/tokenStorage";

/* Who may use the owner's phone admin, and how it signs in (ROUND50, ROUND49
   A.4). Only the superadmin. Every other account is refused with this line and
   no token is kept. */
export const OWNER_SIGN_IN_REFUSED = "This account cannot use AV Admin.";

/* The home-screen name, also the manifest's name and short_name
   (public/owner.webmanifest) and owner.html's title and the iPhone's
   apple-mobile-web-app-title. */
export const OWNER_APP_NAME = "AV Admin";

export function isOwnerRole(role: string | undefined): boolean {
  return role === UserRole.SUPERADMIN;
}

export class OwnerSignInRefused extends Error {
  constructor() {
    super(OWNER_SIGN_IN_REFUSED);
    this.name = "OwnerSignInRefused";
  }
}

/* Read from storage alone, before any API call: whether the stored session is
   the superadmin's and can still reach the server. The shared axios client
   sends any session it cannot refresh to /login (axiosClient.ts:123-128,
   :159-167), so an owner screen asks this first and shows the owner's own
   sign-in instead. An expired access token is still usable while the refresh
   token is not expired: the client refreshes it on the first 401. */
export function ownerSessionUsable(): boolean {
  const token = getToken();
  if (!token || !isOwnerRole(decodeToken(token)?.role)) return false;
  if (!isTokenExpired(token)) return true;
  const refreshToken = getRefreshToken();
  return !!refreshToken && !isTokenExpired(refreshToken);
}

export interface OwnerSignIn {
  token: string;
  refreshToken: string;
  user: User;
}

/* POST /api/auth/sign-in, the role read from the new token, then GET
   /api/profile/me with that token. The profile read goes around the shared
   client on purpose: its request interceptor replaces the Authorization header
   with whatever token is already stored (axiosClient.ts:76-83), which would
   read a stored client's profile instead. Nothing is stored here; the screen
   hands the answer to AuthContext's login. */
export async function signInOwner(email: string, password: string): Promise<OwnerSignIn> {
  const tokens = await signIn({ email, password });
  if (!isOwnerRole(decodeToken(tokens.access_token)?.role)) throw new OwnerSignInRefused();
  const { data: user } = await axios.get<User>(`${axiosClient.defaults.baseURL}/profile/me`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${tokens.access_token}` },
  });
  // The server's own word on the role, not only the token's.
  if (!isOwnerRole(user.role)) throw new OwnerSignInRefused();
  return { token: tokens.access_token, refreshToken: tokens.refresh_token, user };
}

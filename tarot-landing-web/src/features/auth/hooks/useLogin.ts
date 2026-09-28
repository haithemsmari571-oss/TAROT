import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { signIn } from "../api";
import axiosClient from "@/lib/axiosClient";
import { useAuth } from "./useAuth";
import { UserRole } from "../types/auth.types";
import type { LoginRequest, User } from "../types";
import { decodeToken } from "../utils/tokenStorage";
import { HOME_PATH, READERS_PATH } from "@/features/client-app/clientAppPaths";
import { openConversation, readerIdFrom, readerProfilePath, threadPath } from "@/features/client-app/readerIntent";
import { noteWelcomeMoment } from "@/features/celebrations/welcomeMoment";
import { WebsiteSignInRefused, signsInHere } from "../websiteSignIn";

/* Where a client lands once signed in. With the reader she chose as a guest
   (?reader, readerIntent.ts): that reader's thread, opened (or found) with her
   new token before she lands, or that reader's profile, its Message button
   ready, when the thread cannot be opened. With no reader: the app's Home. */
async function clientLanding(readerId: number | null, token: string): Promise<{ path: string; price: number | null }> {
  if (readerId == null) return { path: HOME_PATH, price: null };
  try {
    const opened = await openConversation(readerId, { headers: { Authorization: `Bearer ${token}` } });
    return { path: threadPath(opened.chat_id), price: opened.price_per_message };
  } catch {
    return { path: readerProfilePath(readerId), price: null };
  }
}

/** afterSignUp: the sign-in register.tsx makes with the details she has just
    signed up with. It leaves the welcome-credit moment for the screen she
    lands on (welcomeMoment.ts). */
export const useLogin = ({ afterSignUp = false }: { afterSignUp?: boolean } = {}) => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const readerId = readerIdFrom(searchParams);

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const response = await signIn(credentials);

      // Decode JWT to get the role
      const decodedToken = decodeToken(response.access_token);
      if (!decodedToken) {
        throw new Error("Failed to decode token");
      }
      // A reader or admin account is refused here, before any token is kept
      // (websiteSignIn.ts); the page shows the refusal and stays.
      if (!signsInHere(decodedToken.role)) {
        throw new WebsiteSignInRefused();
      }

      const userResponse = await axiosClient.get<User>("/profile/me", {
        headers: {
          Authorization: `Bearer ${response.access_token}`,
        },
      });

      const landing = decodedToken.role === UserRole.USER
        ? await clientLanding(readerId, response.access_token)
        : null;

      return {
        token: response.access_token,
        refreshToken: response.refresh_token,
        user: userResponse.data,
        role: decodedToken.role,
        landing,
      };
    },
    onSuccess: (data) => {
      login(data.token, data.user, data.refreshToken);

      console.log("Login success - Role from JWT:", data.role);
      console.log("Login success - User role:", data.user.role);
      console.log("UserRole enum:", UserRole);

      // Redirect based on user role from JWT. A reader or admin never gets
      // here: mutationFn refused them (websiteSignIn.ts).
      if (data.role === UserRole.SUPERADMIN) {
        window.location.assign("/crm/#/control");
      } else if (data.role === UserRole.USER && data.landing) {
        // Clients land in the app: in her reader's thread when she chose one.
        if (afterSignUp) {
          const toReader = data.landing.path === HOME_PATH ? READERS_PATH : data.landing.path;
          noteWelcomeMoment({ at: data.landing.path, to: toReader, price: data.landing.price });
        }
        navigate(data.landing.path);
      } else {
        // Fallback to psychics browse
        navigate("/psychics-browse");
      }
    },
    onError: (error: any) => {
      console.error("Login failed:", error);
    },
  });
};

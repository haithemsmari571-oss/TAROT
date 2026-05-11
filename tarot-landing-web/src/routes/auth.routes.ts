import Login from "../features/auth/views/login";
import Register from "../features/auth/views/register";
import ForgotPassword from "../features/auth/views/forgot-password";
import ResetPassword from "../features/auth/views/reset-password";
import VerifyEmail from "../features/auth/views/verify-email";
import type { RouteConfig } from "./app.routes";

const authRoutes: RouteConfig[] = [
  {
    path: "/login",
    name: "Login Page",
    component: Login,
    layout: "guest",
  },
  {
    path: "/register",
    name: "Register Page",
    component: Register,
    layout: "guest",
  },
  {
    path: "/forgot-password",
    name: "Forgot Password Page",
    component: ForgotPassword,
    layout: "guest",
  },
  {
    path: "/reset-password/:token",
    name: "Reset Password Page",
    component: ResetPassword,
    layout: "guest",
  },
  {
    path: "/verify-email/:token",
    name: "Verify Email Page",
    component: VerifyEmail,
    layout: "guest",
  },
  {
    path: "/verify-account",
    name: "Verify Account Page",
    component: VerifyEmail,
    layout: "guest",
  },
];

export default authRoutes;

import { lazy } from "react";
import type { RouteConfig } from "./app.routes";
import { withNoIndex, withSeo } from "../components/Seo";
const Login = lazy(() => import("../features/auth/views/login"));
const Register = lazy(() => import("../features/auth/views/register"));
const ForgotPassword = lazy(() => import("../features/auth/views/forgot-password"));
const ResetPassword = lazy(() => import("../features/auth/views/reset-password"));
const VerifyEmail = lazy(() => import("../features/auth/views/verify-email"));
// The account links (reset and verify) are kept out of search; /verify-email/:token
// is the same screen as /verify-account and lands there.
const VerifyEmailNoIndex = withNoIndex(VerifyEmail);

const authRoutes: RouteConfig[] = [
  {
    path: "/login",
    name: "Login Page",
    component: withSeo(Login, "/login"),
    layout: "guest",
  },
  {
    path: "/register",
    name: "Register Page",
    component: withSeo(Register, "/register"),
    layout: "guest",
  },
  {
    path: "/forgot-password",
    name: "Forgot Password Page",
    component: withSeo(ForgotPassword, "/forgot-password"),
    layout: "guest",
  },
  {
    path: "/reset-password/:token",
    name: "Reset Password Page",
    component: withNoIndex(ResetPassword),
    layout: "guest",
  },
  {
    path: "/verify-email/:token",
    name: "Verify Email Page",
    component: VerifyEmailNoIndex,
    layout: "guest",
  },
  {
    path: "/verify-account",
    name: "Verify Account Page",
    component: VerifyEmailNoIndex,
    layout: "guest",
  },
];

export default authRoutes;

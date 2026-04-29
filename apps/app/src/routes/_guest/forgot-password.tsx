import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordPage } from "../../features/auth/forgot-password.page";

export const Route = createFileRoute("/_guest/forgot-password")({
  component: ForgotPasswordPage,
});

import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { redirect } from "@tanstack/react-router";
import { env } from "../env";
import { signInUrl } from "./sign-in-url";

const MFA_MISSING = "ADMIN_STAFF_MFA_FORBIDDEN";

export function refusalRedirect(error: unknown, returnTo: string) {
  const { code, status } = apiErrorFields(error);

  if (status === 401) {
    return redirect({ href: signInUrl(env.VITE_APP_URL, returnTo), reloadDocument: true });
  }
  if (status !== 403) return undefined;

  return redirect({ to: "/denied", search: { reason: code === MFA_MISSING ? "mfa" : undefined } });
}

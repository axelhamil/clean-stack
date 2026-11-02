import { STAFF_REFUSAL } from "@packages/access-control";
import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { redirect } from "@tanstack/react-router";
import { env } from "../env";
import { isLostAccess } from "./is-lost-access";
import { signInUrl } from "./sign-in-url";

const POLICIES_STALE = "POLICY_ACCEPTANCE_REQUIRED";

function deniedReason(code: string | undefined) {
  if (code === STAFF_REFUSAL.mfaMissing) return "mfa";
  if (code === POLICIES_STALE) return "policies";

  return undefined;
}

export function refusalRedirect(error: unknown, returnTo: string) {
  const { code, status } = apiErrorFields(error);

  if (status === 401) {
    return redirect({ href: signInUrl(env.VITE_APP_URL, returnTo), reloadDocument: true });
  }
  if (!isLostAccess(error) && code !== POLICIES_STALE) return undefined;

  return redirect({ to: "/denied", search: { reason: deniedReason(code) } });
}

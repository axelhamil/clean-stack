import type { GenericEndpointContext } from "better-auth";
import { APIError } from "better-auth/api";
import { SCIM_PATHS } from "../shared/auth/sso-paths";
import { getClientIp, getVisitorGeo } from "../shared/request-context";
import type { AuthDeps } from "./deps";

/**
 * Client IP for event payloads and compliance records, as resolved by the
 * trusted-proxy resolver for the current request (`app.ts` puts it in the request
 * context, a BetterAuth hook has no Hono context of its own). Never read
 * `X-Forwarded-For` here: any client can send one.
 */
export function requestClientIp(): string | null {
  return getClientIp()?.slice(0, 45) ?? null;
}

export function createVisitorGuard(deps: Pick<AuthDeps, "securitySignals">): {
  refuseDeniedVisitor(path: string, actorUserId: string | null): Promise<void>;
} {
  return {
    async refuseDeniedVisitor(path, actorUserId) {
      const refusal = await deps.securitySignals.refuseDenied({
        visitor: getVisitorGeo(),
        ip: requestClientIp(),
        path,
        actorUserId,
      });
      if (refusal.isSuccess) return;

      const { code, message } = refusal.getError();
      throw new APIError("FORBIDDEN", { code, message });
    },
  };
}

export function renewsOwnSession(context: GenericEndpointContext | null, userId: string): boolean {
  return context?.context.session?.user.id === userId;
}

export function provisionsForSomeoneElse(path: string | undefined): boolean {
  return path === "/admin/create-user" || path === SCIM_PATHS.users;
}

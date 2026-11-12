import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { IMPERSONATE_PATH } from "../../shared/middleware/impersonation-blocklist";
import { getVisitorGeo } from "../../shared/request-context";
import type { AuthDeps } from "../deps";
import { renewsOwnSession } from "../visitor";

export function securitySignalsPlugin(deps: Pick<AuthDeps, "securitySignals">) {
  return {
    id: "security-signals",
    hooks: {
      after: [
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            const signedIn = ctx.context.newSession;
            if (!signedIn || ctx.path === IMPERSONATE_PATH) return;
            if (renewsOwnSession(ctx, signedIn.user.id)) return;

            const { returned } = ctx.context;
            if (returned instanceof APIError && Number(returned.statusCode) >= 400) return;

            await deps.securitySignals.reportImpossibleTravel({
              userId: signedIn.user.id,
              sessionId: signedIn.session.id,
              ip: signedIn.session.ipAddress ?? null,
              visitor: getVisitorGeo(),
            });
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}

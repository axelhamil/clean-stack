import { AppErrorException } from "@packages/ddd-kit";
import { createMiddleware } from "hono/factory";

export function assertNotImpersonated(session?: { impersonatedBy?: string | null } | null): void {
  if (!session?.impersonatedBy) return;

  throw new AppErrorException({
    code: "IMPERSONATION_ACTION_FORBIDDEN",
    message: "action unavailable while impersonating",
  });
}

export const denyImpersonated = createMiddleware<{
  Variables: { session: { impersonatedBy?: string | null } };
}>(async (c, next) => {
  assertNotImpersonated(c.get("session"));
  await next();
});

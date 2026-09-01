import { AppErrorException } from "@packages/ddd-kit";
import { createMiddleware } from "hono/factory";

export const denyImpersonated = createMiddleware<{
  Variables: { session: { impersonatedBy?: string | null } };
}>(async (c, next) => {
  const session = c.get("session");
  if (session?.impersonatedBy) {
    throw new AppErrorException({
      code: "IMPERSONATION_ACTION_FORBIDDEN",
      message: "action unavailable while impersonating",
    });
  }
  await next();
});

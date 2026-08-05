import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

export const denyImpersonated = createMiddleware<{
  Variables: { session: { impersonatedBy?: string | null } };
}>(async (c, next) => {
  const session = c.get("session");
  if (session?.impersonatedBy) {
    throw new HTTPException(403, { message: "IMPERSONATION_ACTION_FORBIDDEN" });
  }
  await next();
});

import { AppErrorException } from "@packages/ddd-kit";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { SessionUser } from "../../auth";
import { di } from "../../container";

export const requireCurrentPolicies = createMiddleware<{
  Variables: {
    user?: SessionUser;
    session?: { impersonatedBy?: string | null };
  };
}>(async (c, next) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "Unauthorized" });

  if (c.get("session")?.impersonatedBy) return next();

  const r = await di.PolicyAcceptanceService.hasAcceptedCurrent(user.id);
  if (r.isFailure) throw new AppErrorException(r.getError());
  if (!r.getValue()) throw new HTTPException(409, { message: "Policy acceptance required" });

  await next();
});

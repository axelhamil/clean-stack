import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { SessionUser } from "../../auth";
import { env } from "../env";

export const requirePlatformAdmin = createMiddleware<{
  Variables: { user: SessionUser };
}>(async (c, next) => {
  const user = c.get("user") as (SessionUser & { role?: string }) | null;
  if (!user) throw new HTTPException(401, { message: "Unauthorized" });

  const isOperator = env.PLATFORM_ADMIN_IDS.includes(user.id) || user.role === "admin";
  if (!isOperator) throw new HTTPException(403, { message: "PLATFORM_ADMIN_FORBIDDEN" });

  if (env.PLATFORM_ADMIN_REQUIRE_MFA && user.twoFactorEnabled !== true)
    throw new HTTPException(403, { message: "PLATFORM_ADMIN_MFA_REQUIRED" });

  await next();
});

import { AppErrorException } from "@packages/ddd-kit";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { di } from "../../container";
import type { AuthVariables } from "./auth.middleware";

export const requireCurrentPolicies = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const user = c.get("user");
    if (!user) throw new HTTPException(401, { message: "Unauthorized" });

    const r = await di.PolicyAcceptanceService.hasAcceptedCurrent(user.id);
    if (r.isFailure) throw new AppErrorException(r.getError());
    if (!r.getValue()) throw new HTTPException(409, { message: "Policy acceptance required" });

    await next();
  },
);

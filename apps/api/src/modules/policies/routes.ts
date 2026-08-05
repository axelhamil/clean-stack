import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { denyImpersonated } from "../../shared/middleware/deny-impersonated.middleware";
import { zV } from "../../shared/validator";
import { acceptPoliciesDto } from "./application/dto/accept-policies.dto";

export const policyRoutes = new Hono<{ Variables: AuthVariables }>()
  .post("/accept", requireAuth, denyImpersonated, zV("json", acceptPoliciesDto), async (c) => {
    const user = c.get("user");
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    const body = c.req.valid("json");

    let types = body.types;
    if (!types) {
      const staleResult = await di.PolicyAcceptanceService.getStaleTypes(user.id);
      if (staleResult.isFailure) throw new AppErrorException(staleResult.getError());
      types = staleResult.getValue();
    }

    const r = await di.PolicyAcceptanceService.accept(user.id, types, ip);
    if (r.isFailure) throw new AppErrorException(r.getError());

    const status = await di.PolicyAcceptanceService.getStatus(user.id);
    if (status.isFailure) throw new AppErrorException(status.getError());
    return c.json(status.getValue());
  })
  .get("/", requireAuth, async (c) => {
    const user = c.get("user");
    const r = await di.PolicyAcceptanceService.getStatus(user.id);
    if (r.isFailure) throw new AppErrorException(r.getError());
    return c.json(r.getValue());
  });

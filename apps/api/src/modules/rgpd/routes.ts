import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { zV } from "../../shared/validator";
import { requestDeletionBodySchema } from "./application/dto/request-account-deletion.dto";

export const rgpdMeRoutes = new Hono<{ Variables: AuthVariables }>()
  .post("/export", requireAuth, async (c) => {
    const result = await di.RgpdService.requestDataExport({
      userId: c.get("user").id,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json(result.getValue());
  })
  .get("/delete/preflight", requireAuth, async (c) => {
    const result = await di.RgpdService.preflightAccountDeletion({
      userId: c.get("user").id,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json(result.getValue());
  })
  .post("/delete", requireAuth, zV("json", requestDeletionBodySchema), async (c) => {
    const result = await di.RgpdService.requestAccountDeletion({
      userId: c.get("user").id,
      ...c.req.valid("json"),
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json(result.getValue());
  })
  .delete("/delete", requireAuth, async (c) => {
    const result = await di.RgpdService.cancelAccountDeletion({
      userId: c.get("user").id,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json(result.getValue());
  });

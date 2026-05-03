import { zValidator } from "@hono/zod-validator";
import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { type AuthVariables, requireAuth } from "../adapters/middleware/auth.middleware";
import { requestDeletionBodySchema } from "../application/dto/request-account-deletion.dto";
import { di } from "../di/container";

export const meRoutes = new Hono<{ Variables: AuthVariables }>()
  .post("/export", requireAuth, async (c) => {
    const result = await di.GdprService.requestDataExport({
      userId: c.get("user").id,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json(result.getValue());
  })
  .get("/delete/preflight", requireAuth, async (c) => {
    const result = await di.GdprService.preflightAccountDeletion({
      userId: c.get("user").id,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json(result.getValue());
  })
  .post("/delete", requireAuth, zValidator("json", requestDeletionBodySchema), async (c) => {
    const result = await di.GdprService.requestAccountDeletion({
      userId: c.get("user").id,
      ...c.req.valid("json"),
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json(result.getValue());
  })
  .delete("/delete", requireAuth, async (c) => {
    const result = await di.GdprService.cancelAccountDeletion({
      userId: c.get("user").id,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json(result.getValue());
  });

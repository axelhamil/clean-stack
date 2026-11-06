import { AppErrorException, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { zV } from "@packages/http/validator";
import { emitEvent } from "@packages/outbox/event-emitter";
import { Hono } from "hono";
import { z } from "zod";
import { di } from "../../container";
import type { ApiTokenVariables } from "../../shared/middleware/api-token.middleware";
import { requireCurrentPolicies } from "../../shared/middleware/policy.middleware";
import type { UserAccountError } from "../../shared/ports/user-account.port";
import { requireScope } from "../require-scope";
import { meResponseSchema } from "./schemas";

const patchMeSchema = z.object({ name: z.string().min(1).max(100) });

export const mePublicRoutes = new Hono<{ Variables: ApiTokenVariables }>()
  .get("/", requireScope("read:profile"), (c) =>
    c.json(meResponseSchema.parse({ user: c.get("user") })),
  )
  .patch(
    "/",
    requireScope("write:profile"),
    requireCurrentPolicies,
    zV("json", patchMeSchema),
    async (c) => {
      const { name } = c.req.valid("json");
      const userId = c.get("user").id;

      const updated = await di.ITransactionService.run(async () => {
        const written = await di.IUserAccountStore.setName(userId, name);
        if (written.isFailure) return written;

        await emitEvent(
          di.IOutboxRepository,
          EventTypes.USER_PROFILE_UPDATED,
          "user",
          userId,
          { userId, changes: { name } },
          {},
        );

        return Result.ok<UserAccountError>();
      });
      if (updated.isFailure) throw new AppErrorException(updated.getError());

      return c.json({ ok: true });
    },
  );

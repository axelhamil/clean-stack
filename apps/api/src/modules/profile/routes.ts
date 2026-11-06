import { AppErrorException, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import { di } from "../../container";
import { emitEvent } from "../../shared/event-emitter";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { denyImpersonated } from "../../shared/middleware/deny-impersonated.middleware";
import { requireCurrentPolicies } from "../../shared/middleware/policy.middleware";
import type { ProfileError } from "../../shared/ports/profile.port";
import { zV } from "../../shared/validator";
import { localeSchema } from "./profile.schema";

export const profileRoutes = new Hono<{ Variables: AuthVariables }>().put(
  "/locale",
  requireAuth,
  requireCurrentPolicies,
  denyImpersonated,
  zV("json", localeSchema),
  async (c) => {
    const { locale } = c.req.valid("json");
    const userId = c.get("user").id;

    const done = await di.ITransactionService.run(async (): Promise<Result<void, ProfileError>> => {
      const previous = await di.IProfileStore.findLocale(userId);
      if (previous.isFailure) return Result.fail(previous.getError());

      const written = await di.IProfileStore.setLocale(userId, locale);
      if (written.isFailure) return written;

      await emitEvent(
        di.IOutboxRepository,
        EventTypes.USER_LOCALE_CHANGED,
        "user",
        userId,
        {
          userId,
          locale,
          previousLocale: previous.getValue().toNull(),
        },
        {},
      );

      return Result.ok();
    });
    if (done.isFailure) throw new AppErrorException(done.getError());

    return c.json({ ok: true as const });
  },
);

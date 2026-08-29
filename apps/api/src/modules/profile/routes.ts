import { AppErrorException } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import { di } from "../../container";
import { emitEvent } from "../../shared/event-emitter";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { denyImpersonated } from "../../shared/middleware/deny-impersonated.middleware";
import { zV } from "../../shared/validator";
import { localeSchema } from "./profile.schema";

export const profileRoutes = new Hono<{ Variables: AuthVariables }>().put(
  "/locale",
  requireAuth,
  denyImpersonated,
  zV("json", localeSchema),
  async (c) => {
    const { locale } = c.req.valid("json");
    const userId = c.get("user").id;

    await di.ITransactionService.run(async (tx) => {
      const previous = await di.IProfileStore.findLocale(userId, tx);
      if (previous.isFailure) throw new AppErrorException(previous.getError());
      const previousLocale = previous.getValue();

      const written = await di.IProfileStore.setLocale(userId, locale, tx);
      if (written.isFailure) throw new AppErrorException(written.getError());

      await emitEvent(
        di.IOutboxRepository,
        EventTypes.USER_LOCALE_CHANGED,
        "user",
        userId,
        {
          userId,
          locale,
          previousLocale: previousLocale.isSome() ? previousLocale.unwrap() : null,
        },
        {},
        tx,
      );
    });

    return c.json({ ok: true as const });
  },
);

import { AppErrorException, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { Hono } from "hono";
import { localeSchema } from "../../application/dto/set-locale.dto";
import type { IProfileStore, ProfileError } from "../../application/ports/profile.port";

export interface ProfileRoutesDeps {
  routeGuards: RouteGuards;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IProfileStore: Pick<IProfileStore, "findLocale" | "setLocale">;
}

export function createProfileRoutes(deps: ProfileRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>().put(
    "/locale",
    g.requireAuth,
    g.requireCurrentPolicies,
    g.denyImpersonated,
    zV("json", localeSchema),
    async (c) => {
      const { locale } = c.req.valid("json");
      const userId = g.currentUserId(c);

      const done = await deps.ITransactionService.run(
        async (): Promise<Result<void, ProfileError>> => {
          const previous = await deps.IProfileStore.findLocale(userId);
          if (previous.isFailure) return Result.fail(previous.getError());

          const written = await deps.IProfileStore.setLocale(userId, locale);
          if (written.isFailure) return written;

          await emitEvent(
            deps.IOutboxRepository,
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
        },
      );
      if (done.isFailure) throw new AppErrorException(done.getError());

      return c.json({ ok: true as const });
    },
  );
}

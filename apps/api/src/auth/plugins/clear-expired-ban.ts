import { EventTypes } from "@packages/events";
import type { BetterAuthPlugin } from "better-auth";
import type { AuthDeps } from "../deps";
import type { AuthHelpers } from "../helpers";

export function clearExpiredBanPlugin(
  deps: Pick<AuthDeps, "uow" | "queries">,
  helpers: Pick<AuthHelpers, "emit">,
) {
  return {
    id: "clear-expired-ban",
    init: () => ({
      options: {
        databaseHooks: {
          session: {
            create: {
              before: async (session: { userId: string }) => {
                await deps.uow.run(async () => {
                  if (!(await deps.queries.clearExpiredBan(session.userId))) return;
                  await helpers.emit(EventTypes.ADMIN_USER_UNBANNED, "user", session.userId, {
                    actorUserId: null,
                    userId: session.userId,
                  });
                });
              },
            },
          },
        },
      },
    }),
  } satisfies BetterAuthPlugin;
}

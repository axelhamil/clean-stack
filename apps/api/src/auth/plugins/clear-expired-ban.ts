import { EventTypes } from "@packages/events";
import type { BetterAuthPlugin } from "better-auth";
import { di } from "../../container";
import { emit } from "../emit";
import { clearExpiredBan } from "../queries";

export const clearExpiredBanBeforeAdminPlugin = {
  id: "clear-expired-ban",
  init: () => ({
    options: {
      databaseHooks: {
        session: {
          create: {
            before: async (session: { userId: string }) => {
              await di.ITransactionService.run(async () => {
                if (!(await clearExpiredBan(session.userId))) return;
                await emit(EventTypes.ADMIN_USER_UNBANNED, "user", session.userId, {
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

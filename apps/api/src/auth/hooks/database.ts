import { AppErrorException } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { di } from "../../container";
import { isSsoEnforcedFor } from "../../shared/auth/sso-enforcement";
import { isSsoCallbackPath } from "../../shared/auth/sso-paths";
import { logger } from "../../shared/logger";
import { IMPERSONATE_PATH } from "../../shared/middleware/impersonation-blocklist";
import { getVisitorGeo } from "../../shared/request-context";
import { emit } from "../emit";
import { ensurePersonalOrgFor } from "../personal-org";
import { clearConfirmedPendingEmail, emailFor, enforcedProviderForDomain } from "../queries";
import {
  provisionsForSomeoneElse,
  refuseDeniedVisitor,
  renewsOwnSession,
  requestClientIp,
} from "../visitor";

export const databaseHooks = {
  user: {
    create: {
      before: async (_user, context) => {
        if (provisionsForSomeoneElse(context?.path)) return;

        await refuseDeniedVisitor(context?.path ?? "user", null);
      },
      after: async (user) => {
        try {
          await ensurePersonalOrgFor(user.id, { email: user.email, name: user.name });
        } catch (err) {
          logger.error({ err, userId: user.id }, "personal-org creation failed at signup");
          throw err;
        }
      },
    },
    update: {
      after: async (user) => {
        await di.ITransactionService.run(async () => {
          const cleared = await clearConfirmedPendingEmail(user.id, user.email);
          if (!cleared) return;
          await emit(
            EventTypes.USER_PROFILE_UPDATED,
            "user",
            user.id,
            { userId: user.id, changes: { email: user.email } },
            null,
          );
        });
      },
    },
  },
  session: {
    create: {
      before: async (session, context) => {
        // SSO enforcement, non-email-bearing leg: passkey sign-in carries no email
        // (the `hooks.before` step only sees the email-bearing paths), and this hook
        // fires for every session creation whatever the path.
        //
        // The discriminator is the REQUEST, never the user. Any user-linkage query
        // ("does this user own an SSO account?") answers a different question: once
        // a user has signed in through the IdP once, they own an SSO `account` row
        // forever, so a later passkey ceremony for the same user would be waved
        // through, which is exactly the deprovisioning guarantee enforcement sells.
        // BetterAuth passes the endpoint context as the second argument
        // (`createWithHooks` → `getCurrentAuthContext()`, better-auth/dist/db/with-hooks.mjs),
        // and its `path` is the endpoint's own registered path, so the SSO callback
        // is identifiable, and every other path is enforced.
        //
        // Impersonation is exempt because it is not the enforced user authenticating:
        // the session is minted for a platform admin who already passed the admin
        // gate, and blocking it would only remove a support capability.
        if (context?.path !== IMPERSONATE_PATH && !renewsOwnSession(context, session.userId)) {
          await refuseDeniedVisitor(context?.path ?? "session", session.userId);
        }

        const createdBySso = isSsoCallbackPath(context?.path) || context?.path === IMPERSONATE_PATH;
        if (!createdBySso) {
          const email = await emailFor(session.userId);
          if (email) {
            const enforced = await isSsoEnforcedFor(email, enforcedProviderForDomain);
            if (enforced.isSome()) {
              throw new APIError("FORBIDDEN", {
                message: "SSO_REQUIRED",
                providerId: enforced.unwrap().providerId,
              });
            }
          }
        }

        // BetterAuth fills ipAddress from raw X-Forwarded-For; keep the trusted-proxy value instead.
        const trusted = {
          ...session,
          ipAddress: requestClientIp(),
          ...di.SecuritySignalsService.sessionFields(getVisitorGeo()),
        };
        if (session.activeOrganizationId) return { data: trusted };

        try {
          const orgId = await ensurePersonalOrgFor(session.userId);
          return { data: { ...trusted, activeOrganizationId: orgId } };
        } catch (err) {
          logger.error({ err, userId: session.userId }, "personal-org self-heal failed at sign-in");
          throw err;
        }
      },
      after: async (session) => {
        await emit(EventTypes.USER_SIGNED_IN, "session", session.id, {
          userId: session.userId,
          sessionId: session.id,
          ipAddress: session.ipAddress ?? undefined,
          userAgent: session.userAgent ?? undefined,
        });
      },
    },
    delete: {
      before: async (session, context) => {
        const ended = await di.StaffService.endSession(session, context?.path);
        if (ended.isFailure) throw new AppErrorException(ended.getError());
      },
    },
  },
  account: {
    delete: {
      after: async (account) => {
        if (account.providerId === "credential") return;
        await emit(EventTypes.USER_ACCOUNT_UNLINKED, "account", account.id, {
          userId: account.userId,
          providerId: account.providerId,
          accountId: account.accountId,
        });
      },
    },
  },
} satisfies NonNullable<BetterAuthOptions["databaseHooks"]>;

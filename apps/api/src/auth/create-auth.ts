// Type-only anchors: the inferred `auth` type references these packages' types, and TS
// can only name them portably from a direct dependency. @simplewebauthn/server must
// therefore stay on the exact major @better-auth/passkey depends on (13 as of passkey
// 1.7.14): a direct 14 resolves to a second copy and brings TS2883 back.
import "@simplewebauthn/server";
import "zod/v4/core";
import { passkey } from "@better-auth/passkey";
import * as billingSchema from "@modules/billing/schemas/billing";
import { authSchema, db, multiTenantSchema, ssoSchema } from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, bearer, customSession, magicLink, twoFactor } from "better-auth/plugins";
// biome-ignore lint/correctness/noUnusedImports: type anchor, the inferred `auth` type names Stripe resources through this alias (TS2883)
import type Stripe from "stripe";
import type { AuthDeps } from "./deps";
import { createAuthHelpers } from "./helpers";
import { createAfterHook } from "./hooks/after";
import { createBeforeHook, type SessionReader } from "./hooks/before";
import { createDatabaseHooks } from "./hooks/database";
import { IMPERSONATION_TTL_SECONDS } from "./impersonation-ttl";
import { MIN_PASSWORD_LENGTH } from "./password-policy";
import { clearExpiredBanPlugin } from "./plugins/clear-expired-ban";
import { organizationPlugin } from "./plugins/organization";
import { scimPlugin } from "./plugins/scim";
import { securitySignalsPlugin } from "./plugins/security-signals";
import { ssoPlugin } from "./plugins/sso";
import { stripePlugin } from "./plugins/stripe";
import { findActiveMemberRole } from "./queries";
import { buildSessionPayload } from "./session-payload";
import { TOTP_OPTIONS } from "./totp-options";
import { asUnitOfWork } from "./unit-of-work-adapter";

export function createAuth(deps: AuthDeps) {
  const { settings } = deps;
  const isProd = settings.production;
  const helpers = createAuthHelpers(deps);
  const { emit, emailFlows } = helpers;

  const readSession: SessionReader = (headers) => auth.api.getSession({ headers });

  const authOptions = {
    appName: "clean-stack",
    baseURL: settings.baseUrl,
    secret: settings.secret,
    secrets: settings.secrets,
    rateLimit: { enabled: false },

    // `transaction: true` is required by `@better-auth/scim`, which refuses to start
    // without native transactions: a directory change and the membership it
    // projects must commit or roll back together.
    // The adapter gets `db` wrapped so every transaction it opens is an outermost unit
    // of work: the hooks it runs inside read it through `resolveExecutor()` and their
    // events are flushed before it commits.
    // BetterAuth's Drizzle adapter resolves every model its plugins write (the Stripe
    // plugin's `subscription` included) from this object, so a table a plugin owns
    // has to be listed here, not only exported from its module.
    database: drizzleAdapter(
      asUnitOfWork(db, () => deps.uow),
      {
        provider: "pg",
        transaction: true,
        schema: { ...authSchema, ...multiTenantSchema, ...ssoSchema, ...billingSchema },
      },
    ),

    user: {
      additionalFields: {
        pendingDeletionUntil: { type: "date", required: false, returned: true, input: false },
        lastExportRequestedAt: { type: "date", required: false, returned: true, input: false },
        deletedAt: { type: "date", required: false, returned: false, input: false },
        pendingEmail: { type: "string", required: false, returned: true, input: false },
        locale: { type: "string", required: false, returned: true, input: false },
      },
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: emailFlows.sendChangeEmailConfirmation,
      },
    },

    trustedOrigins: settings.trustedOrigins,

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      sendResetPassword: emailFlows.sendResetPassword,
      onPasswordReset: async ({ user }) => {
        await emit(EventTypes.USER_PASSWORD_CHANGED, "user", user.id, { userId: user.id });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      beforeEmailVerification: emailFlows.beforeEmailVerification,
      sendVerificationEmail: emailFlows.sendVerificationEmail,
    },

    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60,
      },
      additionalFields: {
        country: { type: "string", required: false, returned: false, input: false },
      },
    },

    advanced: {
      ...(settings.cookieDomain
        ? { crossSubDomainCookies: { enabled: true, domain: settings.cookieDomain } }
        : {}),
      defaultCookieAttributes: {
        httpOnly: true,
        secure: isProd,
        // "none" in prod: SPA and API are cross-origin (decoupled deploy), the session
        // cookie must ride cross-site fetch. CSRF is covered in-app by requireCsrf, not SameSite.
        sameSite: isProd ? "none" : "lax",
      },
    },

    plugins: [
      stripePlugin(deps, helpers),
      bearer(),
      twoFactor({ totpOptions: TOTP_OPTIONS }),
      securitySignalsPlugin(deps),
      magicLink({ sendMagicLink: emailFlows.sendMagicLink }),
      passkey({ rpName: "clean-stack" }),
      clearExpiredBanPlugin(deps, helpers),
      admin({
        adminUserIds: settings.platformAdminIds,
        defaultRole: "user",
        adminRoles: ["admin"],
        impersonationSessionDuration: IMPERSONATION_TTL_SECONDS,
      }),
      organizationPlugin(deps, helpers),
      ssoPlugin(),
      scimPlugin(deps, helpers),
    ],

    hooks: {
      before: createBeforeHook(deps, helpers, readSession),
      after: createAfterHook(deps, helpers),
    },

    databaseHooks: createDatabaseHooks(deps, helpers),
  } satisfies BetterAuthOptions;

  const auth = betterAuth({
    ...authOptions,
    plugins: [
      ...authOptions.plugins,
      customSession(async ({ user, session }) => {
        const role = session.activeOrganizationId
          ? await findActiveMemberRole(user.id, session.activeOrganizationId)
          : undefined;

        return buildSessionPayload(user, session, role);
      }, authOptions),
    ],
  });

  return auth;
}

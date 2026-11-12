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
import { di } from "../container";
import { redirectQuery } from "../shared/auth/email-redirect";
import { IMPERSONATION_TTL_SECONDS } from "../shared/auth/impersonation-ttl";
import { markPasswordResetDelivered } from "../shared/auth/password-reset-delivery";
import { TOTP_OPTIONS } from "../shared/auth/totp-options";
import { asUnitOfWork } from "../shared/auth/unit-of-work-adapter";
import { env, FRONT_ORIGINS } from "../shared/env";
import { localeForEmail } from "../shared/locale-for-user";
import { MIN_PASSWORD_LENGTH } from "../shared/password-policy";
import {
  acceptStalePoliciesAtFirstVerification,
  dispatchEmail,
  localeOf,
  tokenIdempotencyKey,
} from "./email";
import { emit } from "./emit";
import { afterHook } from "./hooks/after";
import { createBeforeHook, type SessionReader } from "./hooks/before";
import { databaseHooks } from "./hooks/database";
import { clearExpiredBanBeforeAdminPlugin } from "./plugins/clear-expired-ban";
import { organizationPlugin } from "./plugins/organization";
import { scimPlugin } from "./plugins/scim";
import { securitySignalsPlugin } from "./plugins/security-signals";
import { ssoPlugin } from "./plugins/sso";
import { stripePlugin } from "./plugins/stripe";
import { findActiveMemberRole, setPendingEmail } from "./queries";
import { buildSessionPayload } from "./session-payload";

export { scimMembershipDeps } from "./plugins/scim";

const isProd = env.NODE_ENV === "production";

const readSession: SessionReader = (headers) => auth.api.getSession({ headers });

const authOptions = {
  appName: "clean-stack",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  secrets: env.BETTER_AUTH_SECRETS,
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
    asUnitOfWork(db, () => di.ITransactionService),
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
      sendChangeEmailConfirmation: async ({ user, newEmail, url, token }) => {
        await di.ITransactionService.run(async () => {
          await setPendingEmail(user.id, newEmail);
          await emit(
            EventTypes.USER_EMAIL_CHANGE_REQUESTED,
            "user",
            user.id,
            { userId: user.id, newEmail },
            null,
          );
        });
        await dispatchEmail(
          "change_email",
          user.email,
          { name: user.name ?? "", newEmail, confirmUrl: url },
          tokenIdempotencyKey("change-email", token),
          localeOf(user),
        );
      },
    },
  },

  trustedOrigins: FRONT_ORIGINS,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    sendResetPassword: async ({ user, token }) => {
      const resetUrl = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
      await emit(EventTypes.USER_PASSWORD_RESET_REQUESTED, "user", user.id, {
        userId: user.id,
        email: user.email,
      });
      await dispatchEmail(
        "reset_password",
        user.email,
        { name: user.name ?? "", resetUrl },
        tokenIdempotencyKey("reset-password", token),
        localeOf(user),
      );
      markPasswordResetDelivered();
    },
    onPasswordReset: async ({ user }) => {
      await emit(EventTypes.USER_PASSWORD_CHANGED, "user", user.id, { userId: user.id });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    beforeEmailVerification: async (user) => {
      await acceptStalePoliciesAtFirstVerification(user.id);
    },
    sendVerificationEmail: async ({ user, url, token }) => {
      const verifyUrl = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}${redirectQuery(url, env.ADMIN_URL)}`;
      await dispatchEmail(
        "verify_email",
        user.email,
        { name: user.name ?? "", verifyUrl },
        tokenIdempotencyKey("verify-email", token),
        localeOf(user),
      );
    },
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
    ...(env.AUTH_COOKIE_DOMAIN
      ? { crossSubDomainCookies: { enabled: true, domain: env.AUTH_COOKIE_DOMAIN } }
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
    stripePlugin(),
    bearer(),
    twoFactor({ totpOptions: TOTP_OPTIONS }),
    securitySignalsPlugin,
    magicLink({
      sendMagicLink: async ({ email, token, url }) => {
        const magicUrl = `${env.APP_URL}/magic-link?token=${encodeURIComponent(token)}${redirectQuery(url, env.ADMIN_URL)}`;
        await emit(EventTypes.USER_MAGIC_LINK_REQUESTED, "user", email, { email });
        await dispatchEmail(
          "magic_link",
          email,
          { magicUrl },
          tokenIdempotencyKey("magic-link", token),
          await localeForEmail(di.IProfileStore, email),
        );
      },
    }),
    passkey({ rpName: "clean-stack" }),
    clearExpiredBanBeforeAdminPlugin,
    admin({
      adminUserIds: env.PLATFORM_ADMIN_IDS,
      defaultRole: "user",
      adminRoles: ["admin"],
      impersonationSessionDuration: IMPERSONATION_TTL_SECONDS,
    }),
    organizationPlugin(),
    ssoPlugin(),
    scimPlugin(),
  ],

  hooks: {
    before: createBeforeHook(readSession),
    after: afterHook,
  },

  databaseHooks,
} satisfies BetterAuthOptions;

export const auth = betterAuth({
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

export type SessionUser = typeof auth.$Infer.Session.user;
export type SessionData = typeof auth.$Infer.Session.session;

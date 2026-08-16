import "@simplewebauthn/server";
import "zod/v4/core";
import { passkey } from "@better-auth/passkey";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import { stripe } from "@better-auth/stripe";
import { ac, isPersonalOrg, type OrgRole, roles } from "@packages/access-control";
import { CONSENT_COOKIE_NAME } from "@packages/cookie-consent";
import { db, sql, type Transaction } from "@packages/drizzle";
import { type EventType, EventTypes } from "@packages/events";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
  admin,
  bearer,
  customSession,
  magicLink,
  organization,
  twoFactor,
} from "better-auth/plugins";
import { CryptoHasher } from "bun";
import type Stripe from "stripe";
import {
  clearConfirmedPendingEmail,
  countActiveMembers,
  deleteOrgIfEmpty,
  findActiveMemberOrgId,
  findActiveMemberRole,
  findLatestLinkedAccount,
  findLatestPasskey,
  findOrgOwnerUserId,
  insertPersonalOrgWithOwner,
  setPendingEmail,
} from "./auth-queries";
import { buildSessionPayload } from "./auth-session-payload";
import { di } from "./container";
import {
  authorizeSubscriptionReference,
  subscriptionEventType,
} from "./modules/billing/application/subscription-events";
import { hasFeature } from "./modules/billing/config";
import { stripeClient } from "./modules/billing/infrastructure/stripe-client";
import { normalizeSamlConfig } from "./shared/auth/saml-config";
import { SSO_PATHS } from "./shared/auth/sso-paths";
import { env } from "./shared/env";
import { emitEvent } from "./shared/event-emitter";
import { logger } from "./shared/logger";
import { assertSeat } from "./shared/middleware/billing.middleware";
import { isBlockedDuringImpersonation } from "./shared/middleware/impersonation-blocklist";
import { MIN_PASSWORD_LENGTH, validatePassword } from "./shared/password-policy";
import type { EmailTemplates, TemplateVariables } from "./shared/ports/email.port";

const isProd = env.NODE_ENV === "production";

/**
 * Derives a stable idempotency key from an opaque BetterAuth token so that
 * retried email sends (e.g. Resend 5xx → retry) don't produce duplicate
 * deliveries. The token is hashed (SHA-256, first 32 hex chars) to avoid
 * storing a verifiable secret in provider logs.
 */
function tokenIdempotencyKey(template: string, token: string): string {
  const hash = new CryptoHasher("sha256").update(token).digest("hex").slice(0, 32);
  return `${template}/${hash}`;
}

interface SignupUser {
  email: string;
  name: string;
}

/**
 * Idempotent bootstrap that guarantees every user has exactly one Personal org
 * and is its owner. Runs at signup (`databaseHooks.user.create.after`) and at
 * every sign-in (`databaseHooks.session.create.before`) to back-fill users who
 * pre-date the org model. A Postgres advisory lock on `userId` prevents the
 * double-insert race that would arise if two concurrent sessions trigger this
 * for the same new user.
 */
async function ensurePersonalOrgFor(userId: string, signupUser?: SignupUser): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);

    const existingOrgId = await findActiveMemberOrgId(userId, tx);
    if (existingOrgId) {
      if (signupUser)
        await emit(
          EventTypes.USER_CREATED,
          "user",
          userId,
          { userId, email: signupUser.email, name: signupUser.name },
          null,
          tx,
        );
      return existingOrgId;
    }

    const orgId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const slug = `personal-${orgId}`;
    const now = new Date();
    await insertPersonalOrgWithOwner(
      { orgId, memberId, userId, slug, name: "Personal", createdAt: now },
      tx,
    );
    await emit(
      EventTypes.ORG_CREATED,
      "organization",
      orgId,
      { organizationId: orgId, ownerUserId: userId, slug, name: "Personal" },
      orgId,
      tx,
    );
    await emit(
      EventTypes.ORG_MEMBER_JOINED,
      "member",
      memberId,
      { organizationId: orgId, userId, role: "owner" },
      orgId,
      tx,
    );
    if (signupUser)
      await emit(
        EventTypes.USER_CREATED,
        "user",
        userId,
        { userId, email: signupUser.email, name: signupUser.name },
        null,
        tx,
      );
    return orgId;
  });
}

/**
 * Thin adapter that binds the module-level `di.IOutboxRepository` to
 * `emitEvent` so BetterAuth hooks don't need to import the DI container
 * directly. Keeps all hook bodies concise and the DI reference local.
 */
async function emit<TPayload>(
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
  organizationId?: string | null,
  tx?: Transaction,
): Promise<void> {
  await emitEvent(
    di.IOutboxRepository,
    eventType,
    aggregateType,
    aggregateId,
    payload,
    { organizationId },
    tx,
  );
}

/**
 * DRY seat-check helper used by every member-creation gate (direct add,
 * invitation acceptance, invitation creation). Throws 402 if the org is at
 * or over its plan seat cap. Centralised so the 3-line check is never
 * duplicated across hooks (CLAUDE.md reusability rule, §6 two-path trap).
 */
async function assertSeatAvailableFor(orgId: string): Promise<void> {
  const view = await di.EntitlementsService.getEntitlements(orgId);
  const activeMembers = await countActiveMembers(orgId);
  assertSeat(activeMembers, view.maxMembers);
}

/**
 * Best-effort client IP from a BetterAuth hook's `ctx.headers` for audit-only
 * event payloads. NOT the trusted-proxy resolver (`resolveClientIp`, Hono layer,
 * unreachable from here) — acceptable because these emits are non-blocking audit.
 */
function clientIpFromHeaders(headers?: Headers): string | null {
  return headers?.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 45) ?? null;
}

function readCookieFromHeaders(headers: Headers | undefined, name: string): string | undefined {
  const raw = headers?.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/**
 * Sends a transactional email through `IEmailService` and surfaces failures
 * as a thrown `Error` — the only signal available inside BetterAuth's
 * `async () => void` hook signature. Transport-not-configured is downgraded
 * to a warning (dev/test without Resend configured should not crash).
 */
async function dispatchEmail<K extends keyof EmailTemplates>(
  template: K,
  to: string,
  variables: EmailTemplates[K] & TemplateVariables,
  idempotencyKey: string,
): Promise<void> {
  const result = await di.IEmailService.sendTemplate(template, to, variables, {
    idempotencyKey,
  });
  if (result.isFailure) {
    const error = result.getError();
    if (error.code === "EMAIL_PROVIDER_FAILURE") {
      // BetterAuth hook signature is `async () => void` — no Result propagation possible; throw is the only signal.
      throw new Error(`email send failed (${template}): ${error.message}`);
    }
    logger.warn({ template, to, code: error.code }, "email skipped — transport not configured");
  }
}

const authOptions = {
  appName: "clean-stack",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  rateLimit: { enabled: false },

  database: drizzleAdapter(db, { provider: "pg" }),

  user: {
    additionalFields: {
      pendingDeletionUntil: { type: "date", required: false, returned: true, input: false },
      lastExportRequestedAt: { type: "date", required: false, returned: true, input: false },
      deletedAt: { type: "date", required: false, returned: false, input: false },
      pendingEmail: { type: "string", required: false, returned: true, input: false },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url, token }) => {
        await setPendingEmail(user.id, newEmail);
        await emit(EventTypes.USER_EMAIL_CHANGE_REQUESTED, "user", user.id, {
          userId: user.id,
          newEmail,
        });
        await dispatchEmail(
          "change_email",
          user.email,
          { name: user.name ?? "", newEmail, confirmUrl: url },
          tokenIdempotencyKey("change-email", token),
        );
      },
    },
  },

  trustedOrigins: env.CORS_ORIGIN,

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
      );
    },
    onPasswordReset: async ({ user }) => {
      await emit(EventTypes.USER_PASSWORD_CHANGED, "user", user.id, { userId: user.id });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }) => {
      const verifyUrl = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
      await dispatchEmail(
        "verify_email",
        user.email,
        { name: user.name ?? "", verifyUrl },
        tokenIdempotencyKey("verify-email", token),
      );
    },
  },

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60,
    },
  },

  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      secure: isProd,
      // "none" in prod: SPA and API are cross-origin (decoupled deploy), the session
      // cookie must ride cross-site fetch. CSRF is covered in-app by requireCsrf, not SameSite.
      sameSite: isProd ? "none" : "lax",
    },
  },

  plugins: [
    stripe({
      stripeClient,
      stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: async () => {
          const catalog = await di.BillingCatalogService.getCatalog();
          return catalog
            .filter((p) => p.priceId !== null)
            .map((p) => ({ name: p.tier, priceId: p.priceId as string }));
        },
        authorizeReference: async ({ user, referenceId, action }) => {
          if (
            action !== "upgrade-subscription" &&
            action !== "cancel-subscription" &&
            action !== "restore-subscription"
          ) {
            return true;
          }
          const role = await findActiveMemberRole(user.id, referenceId);
          return authorizeSubscriptionReference((role ?? undefined) as OrgRole | undefined);
        },
        onSubscriptionComplete: async ({ subscription, plan }) => {
          const actorUserId = await findOrgOwnerUserId(subscription.referenceId);
          await emit(
            EventTypes.BILLING_SUBSCRIPTION_CREATED,
            "subscription",
            subscription.id,
            {
              organizationId: subscription.referenceId,
              subscriptionId: subscription.id,
              tier: plan.name,
              status: subscription.status,
              actorUserId,
              currentPeriodEnd: subscription.periodEnd ?? null,
            },
            subscription.referenceId,
          );
        },
        onSubscriptionUpdate: async ({ subscription }) => {
          const actorUserId = await findOrgOwnerUserId(subscription.referenceId);
          await emit(
            subscriptionEventType(subscription.status),
            "subscription",
            subscription.id,
            {
              organizationId: subscription.referenceId,
              subscriptionId: subscription.id,
              tier: subscription.plan,
              status: subscription.status,
              actorUserId,
              currentPeriodEnd: subscription.periodEnd ?? null,
            },
            subscription.referenceId,
          );
        },
      },
      onEvent: async (event) => {
        if (event.type !== "invoice.payment_failed") return;
        const invoice = event.data.object as Stripe.Invoice;
        const subDetails = invoice.parent?.subscription_details;
        const referenceId = subDetails?.metadata?.referenceId;
        if (!referenceId) return;
        const subscriptionId =
          typeof subDetails?.subscription === "string" ? subDetails.subscription : "";
        await emit(
          EventTypes.BILLING_PAYMENT_FAILED,
          "subscription",
          subscriptionId || invoice.id,
          {
            organizationId: referenceId,
            subscriptionId,
            invoiceId: invoice.id,
            actorUserId: null,
          },
          referenceId,
        );
      },
    }),
    bearer(),
    twoFactor(),
    magicLink({
      sendMagicLink: async ({ email, token }) => {
        const magicUrl = `${env.APP_URL}/magic-link?token=${encodeURIComponent(token)}`;
        await emit(EventTypes.USER_MAGIC_LINK_REQUESTED, "user", email, { email });
        await dispatchEmail(
          "magic_link",
          email,
          { magicUrl },
          tokenIdempotencyKey("magic-link", token),
        );
      },
    }),
    passkey({ rpName: "clean-stack" }),
    admin({ adminUserIds: env.PLATFORM_ADMIN_IDS, defaultRole: "user", adminRoles: ["admin"] }),
    organization({
      ac,
      roles,
      creatorRole: "owner",
      schema: {
        organization: {
          additionalFields: {
            ssoEnforced: { type: "boolean", required: false, returned: true, input: false },
          },
        },
      },
      organizationHooks: {
        beforeAddMember: async ({ organization: org }) => {
          await assertSeatAvailableFor(org.id);
        },
        // Gate the invite-create path so operators get early feedback when the
        // org is already at cap (nice-to-have UX, not the authoritative gate).
        beforeCreateInvitation: async ({ organization: org }) => {
          await assertSeatAvailableFor(org.id);
        },
        // Authoritative gate for the invite→accept path. `beforeAddMember` does
        // NOT fire on invitation acceptance (§6 two-path trap documented above).
        // Throwing here blocks the accept endpoint with a 402 before the member
        // row is written, closing the over-provisioning race on this path.
        beforeAcceptInvitation: async ({ organization: org }) => {
          await assertSeatAvailableFor(org.id);
        },
        beforeDeleteOrganization: async ({ organization: org }) => {
          if (isPersonalOrg(org.slug)) {
            throw new Error(
              "Personal organization cannot be deleted. Delete your account instead.",
            );
          }
        },
        afterCreateOrganization: async ({ organization: org, member }) => {
          if (isPersonalOrg(org.slug)) return;
          await emit(
            EventTypes.ORG_CREATED,
            "organization",
            org.id,
            {
              organizationId: org.id,
              ownerUserId: member.userId,
              slug: org.slug,
              name: org.name,
            },
            org.id,
          );
        },
        afterUpdateOrganization: async ({ organization: org, user }) => {
          if (!org) return;
          await emit(
            EventTypes.ORG_UPDATED,
            "organization",
            org.id,
            {
              organizationId: org.id,
              actorUserId: user.id,
              changes: { name: org.name, slug: org.slug, logo: org.logo },
            },
            org.id,
          );
        },
        afterDeleteOrganization: async ({ organization: org, user }) => {
          if (isPersonalOrg(org.slug)) return;
          await emit(
            EventTypes.ORG_DELETED,
            "organization",
            org.id,
            { organizationId: org.id, actorUserId: user.id },
            org.id,
          );
        },
        afterAddMember: async ({ member, user, organization: org }) => {
          await emit(
            EventTypes.ORG_MEMBER_JOINED,
            "member",
            member.id,
            {
              organizationId: org.id,
              userId: member.userId,
              role: member.role,
              actorUserId: user.id !== member.userId ? user.id : undefined,
            },
            org.id,
          );
        },
        afterRemoveMember: async ({ member, user, organization: org }) => {
          await emit(
            EventTypes.ORG_MEMBER_REMOVED,
            "member",
            member.id,
            { organizationId: org.id, actorUserId: user.id, userId: member.userId },
            org.id,
          );
          if (isPersonalOrg(org.slug)) return;
          await db.transaction(async (tx) => {
            const deleted = await deleteOrgIfEmpty(org.id, tx);
            if (!deleted) return;
            await emit(
              EventTypes.ORG_DELETED,
              "organization",
              org.id,
              { organizationId: org.id, actorUserId: user.id },
              org.id,
              tx,
            );
          });
        },
        afterUpdateMemberRole: async ({ member, previousRole, user, organization: org }) => {
          await emit(
            EventTypes.ORG_MEMBER_ROLE_CHANGED,
            "member",
            member.id,
            {
              organizationId: org.id,
              actorUserId: user.id,
              userId: member.userId,
              previousRole,
              newRole: member.role,
            },
            org.id,
          );
        },
        afterCreateInvitation: async ({ invitation, organization: org }) => {
          await emit(
            EventTypes.ORG_MEMBER_INVITED,
            "invitation",
            invitation.id,
            {
              organizationId: org.id,
              invitationId: invitation.id,
              email: invitation.email,
              role: invitation.role ?? "member",
              inviterUserId: invitation.inviterId,
            },
            org.id,
          );
        },
        afterCancelInvitation: async ({ invitation, cancelledBy, organization: org }) => {
          await emit(
            EventTypes.ORG_INVITATION_CANCELLED,
            "invitation",
            invitation.id,
            {
              organizationId: org.id,
              actorUserId: cancelledBy.id,
              invitationId: invitation.id,
            },
            org.id,
          );
        },
        // `afterAddMember` only fires for direct adds (org-create creator, signup auto-personal-org).
        // BetterAuth routes invitation acceptance through `afterAcceptInvitation` — without this,
        // every member who joins via invite would be invisible to the outbox.
        afterAcceptInvitation: async ({ member, organization: org }) => {
          await emit(
            EventTypes.ORG_MEMBER_JOINED,
            "member",
            member.id,
            {
              organizationId: org.id,
              userId: member.userId,
              role: member.role,
            },
            org.id,
          );
        },
      },
      sendInvitationEmail: async ({ id, email, role, inviter, organization: org }) => {
        const inviteUrl = `${env.APP_URL}/accept-invitation/${id}`;
        await dispatchEmail(
          "org_invitation",
          email,
          {
            inviterName: inviter.user.name ?? inviter.user.email,
            orgName: org.name,
            role,
            inviteUrl,
          },
          tokenIdempotencyKey("org-invitation", id),
        );
      },
    }),
    sso({
      domainVerification: { enabled: true },
      defaultOverrideUserInfo: false,
      organizationProvisioning: { disabled: false, defaultRole: "member" },
      // `providersLimit` only ever receives `user` (no ctx, no request body — verified
      // against the plugin's dist), so it cannot see which org a registration targets.
      // The business-tier gate lives in hooks.before on "/sso/register" instead, where
      // body.organizationId is available; this stays a flat anti-abuse ceiling per user.
      providersLimit: 10,
    }),
    scim({
      requiredRole: ["owner"],
      providerOwnership: { enabled: true },
      storeSCIMToken: "hashed",
    }),
  ],

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const path = ctx.path;
      const body = ctx.body as Record<string, unknown> | undefined;

      if (isBlockedDuringImpersonation(path) && ctx.headers) {
        const current = await auth.api.getSession({ headers: ctx.headers });
        if (current?.session?.impersonatedBy) {
          throw new APIError("FORBIDDEN", { message: "IMPERSONATION_ACTION_FORBIDDEN" });
        }
      }

      // Credential-stuffing: per-account rate-limit on sign-in (fail-closed — store error → 503)
      if (path === "/sign-in/email") {
        const email = body?.email as string | undefined;
        if (!email) return;
        const ip = clientIpFromHeaders(ctx.headers) ?? "unknown";
        const rl = await di.IRateLimiter.consume(`auth-sign-in:account:${email}`, [
          {
            policyName: "auth-sign-in-account",
            windowSec: env.AUTH_SIGN_IN_ACCOUNT_WINDOW_SEC,
            maxRequests: env.AUTH_SIGN_IN_ACCOUNT_MAX,
          },
        ]);
        if (rl.isFailure) {
          throw new APIError("SERVICE_UNAVAILABLE", { message: "Service temporarily unavailable" });
        }
        const decision = rl.getValue();
        if (!decision.allowed) {
          if (decision.firstBlock) {
            try {
              await emit(
                EventTypes.SECURITY_RATE_LIMIT_EXCEEDED,
                "rate_limit",
                `auth-sign-in-account:${email}`,
                { actorUserId: null, ip, policyName: "auth-sign-in-account", path, method: "POST" },
              );
            } catch (emitErr) {
              logger.warn({ err: emitErr }, "account rate-limit event emit failed");
            }
          }
          throw new APIError("TOO_MANY_REQUESTS", { message: "Too many login attempts" });
        }
        return;
      }

      // D4 business-tier gate: `providersLimit` cannot see the target org (only `user`
      // is passed), so the gate lives here where `body.organizationId` is the one the
      // request actually names — never inferred from session history.
      // D8 SAML hardening runs after the gate: a request refused for lack of
      // entitlement need not have its body rewritten first.
      if (path === SSO_PATHS.register) {
        const organizationId = body?.organizationId as string | undefined;
        if (!organizationId) {
          throw new APIError("FORBIDDEN", { message: "SSO_ORGANIZATION_REQUIRED" });
        }
        const entitlements = await di.EntitlementsService.getEntitlements(organizationId);
        if (!hasFeature(entitlements, "sso")) {
          throw new APIError("FORBIDDEN", { message: "SSO_PLAN_REQUIRED" });
        }

        if (body?.samlConfig && typeof body.samlConfig === "object") {
          const normalized = normalizeSamlConfig(body.samlConfig as Record<string, unknown>);
          if (normalized.isFailure) {
            throw new APIError("BAD_REQUEST", { message: normalized.getError().message });
          }
          body.samlConfig = normalized.getValue();
        }
        return;
      }

      let password: string | undefined;
      let actorEmail: string | undefined;
      let actorName: string | undefined;
      let actorUserId: string | null = null;

      if (path === "/sign-up/email") {
        password = body?.password as string;
        actorEmail = body?.email as string;
        actorName = body?.name as string;

        // Disposable email check (fail-open — DNS error → allow + warn)
        if (env.DISPOSABLE_EMAIL_BLOCK_ENABLED && actorEmail) {
          const d = await di.IDisposableEmailService.isDisposable(actorEmail);
          if (d.isFailure) {
            logger.warn({ err: d.getError() }, "disposable-email check failed — failing open");
          } else if (d.getValue()) {
            try {
              await emit(EventTypes.SECURITY_SIGNUP_REJECTED, "security", actorEmail, {
                actorUserId: null,
                email: actorEmail,
                ip: clientIpFromHeaders(ctx.headers),
                reason: "disposable_email" as const,
              });
            } catch (emitErr) {
              logger.warn({ err: emitErr }, "signup-rejected event emit failed");
            }
            throw new APIError("UNPROCESSABLE_ENTITY", {
              message: "This email address is not accepted.",
            });
          }
        }
      } else if (path === "/reset-password") {
        password = body?.newPassword as string;
      } else if (path === "/change-password") {
        password = body?.newPassword as string;
        // `ctx.context.session` is not populated in a global before-hook (runs before
        // the session middleware) — load it explicitly so the audit actor is the real user.
        const session = ctx.headers ? await auth.api.getSession({ headers: ctx.headers }) : null;
        actorUserId = session?.user.id ?? null;
        actorEmail = session?.user.email;
        actorName = session?.user.name;
      } else {
        return;
      }

      if (typeof password !== "string" || password.length === 0) return;

      const result = await validatePassword(
        password,
        { email: actorEmail, name: actorName, appName: "clean-stack" },
        di.IPasswordBreachService,
      );
      if (result?.isBreach) {
        try {
          await emit(EventTypes.SECURITY_PASSWORD_BREACHED, "security", path, {
            actorUserId,
            email: actorEmail ?? null,
            ip: clientIpFromHeaders(ctx.headers),
            path,
          });
        } catch (emitErr) {
          logger.warn({ err: emitErr }, "password-breached event emit failed");
        }
      }
      if (result !== null) throw new APIError("UNPROCESSABLE_ENTITY", { message: result.message });
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.context.returned instanceof APIError) return;

      const newUserId = ctx.context.newSession?.user?.id;
      if (newUserId) {
        const ccSid = readCookieFromHeaders(ctx.headers, CONSENT_COOKIE_NAME);
        if (ccSid) {
          const linked = await di.ConsentService.reconcile(ccSid, newUserId);
          if (linked.isFailure) {
            logger.warn(
              { err: linked.getError(), userId: newUserId },
              "cookie consent reconcile failed at login",
            );
          }
        }
      }

      const path = ctx.path;

      if (path === "/two-factor/verify-backup-code") {
        const signedInUser = ctx.context.newSession?.user ?? ctx.context.session?.user;
        if (signedInUser) {
          await emit(EventTypes.USER_MFA_BACKUP_CODE_USED, "user", signedInUser.id, {
            userId: signedInUser.id,
            email: signedInUser.email,
          });
        }
        return;
      }

      const userId = ctx.context.session?.user.id;
      if (!userId) return;

      if (path === "/two-factor/enable") {
        await emit(EventTypes.USER_MFA_ENABLED, "user", userId, { userId });
        return;
      }
      if (path === "/two-factor/disable") {
        await emit(EventTypes.USER_MFA_DISABLED, "user", userId, { userId });
        return;
      }
      if (path === "/two-factor/generate-backup-codes") {
        await emit(EventTypes.USER_MFA_BACKUP_CODES_REGENERATED, "user", userId, { userId });
        return;
      }
      if (path === "/passkey/verify-registration") {
        const latest = await findLatestPasskey(userId);
        if (latest) {
          await emit(EventTypes.USER_PASSKEY_ADDED, "user", userId, {
            userId,
            passkeyId: latest.id,
            deviceType: latest.deviceType ?? undefined,
          });
        }
        return;
      }
      if (path === "/passkey/delete-passkey") {
        const body = ctx.body as Record<string, unknown> | undefined;
        const passkeyId = body?.id;
        if (typeof passkeyId === "string") {
          await emit(EventTypes.USER_PASSKEY_REMOVED, "user", userId, { userId, passkeyId });
        }
        return;
      }
      if (path === "/verify-email") {
        const email = ctx.context.session?.user.email;
        if (email) {
          await emit(EventTypes.USER_EMAIL_VERIFIED, "user", userId, { userId, email });
        }
        const stale = await di.PolicyAcceptanceService.getStaleTypes(userId);
        if (stale.isFailure) {
          logger.error(
            { err: stale.getError(), userId },
            "policy staleness check failed at verify-email",
          );
        } else if (stale.getValue().length > 0) {
          const ip =
            ctx.context.newSession?.session?.ipAddress ||
            ctx.context.session?.session?.ipAddress ||
            undefined;
          const recorded = await di.PolicyAcceptanceService.accept(userId, stale.getValue(), ip);
          if (recorded.isFailure) {
            logger.error(
              { err: recorded.getError(), userId },
              "policy acceptance failed at verify-email",
            );
          }
        }
        return;
      }
      if (path === "/change-password") {
        await emit(EventTypes.USER_PASSWORD_CHANGED, "user", userId, { userId });
        return;
      }
      if (path === "/update-user") {
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        const changes: Record<string, unknown> = {};
        if (typeof body.name === "string") changes.name = body.name;
        if (typeof body.image === "string") changes.image = body.image;
        await emit(EventTypes.USER_PROFILE_UPDATED, "user", userId, { userId, changes });
        return;
      }
      if (path === "/link-social") {
        const latest = await findLatestLinkedAccount(userId);
        const recentEnough = latest?.createdAt && Date.now() - latest.createdAt.getTime() < 5_000;
        if (latest && latest.providerId !== "credential" && recentEnough) {
          await emit(EventTypes.USER_ACCOUNT_LINKED, "account", latest.id, {
            userId,
            providerId: latest.providerId,
            accountId: latest.accountId,
          });
        }
        return;
      }
    }),
  },

  databaseHooks: {
    user: {
      create: {
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
          const cleared = await clearConfirmedPendingEmail(user.id, user.email);
          if (!cleared) return;
          await emit(EventTypes.USER_PROFILE_UPDATED, "user", user.id, {
            userId: user.id,
            changes: { email: user.email },
          });
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          if (session.activeOrganizationId) return { data: session };
          try {
            const orgId = await ensurePersonalOrgFor(session.userId);
            return { data: { ...session, activeOrganizationId: orgId } };
          } catch (err) {
            logger.error(
              { err, userId: session.userId },
              "personal-org self-heal failed at sign-in",
            );
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
        after: async (session) => {
          await emit(EventTypes.USER_SIGNED_OUT, "session", session.id, {
            userId: session.userId,
            sessionId: session.id,
          });
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
  },
} satisfies BetterAuthOptions;

export const auth = betterAuth({
  ...authOptions,
  plugins: [
    ...authOptions.plugins,
    customSession(async ({ user, session }) => {
      const role = session.activeOrganizationId
        ? await findActiveMemberRole(user.id, session.activeOrganizationId)
        : undefined;
      return buildSessionPayload(user, session, env.PLATFORM_ADMIN_IDS, role);
    }, authOptions),
  ],
});

export type SessionUser = typeof auth.$Infer.Session.user;
export type SessionData = typeof auth.$Infer.Session.session;

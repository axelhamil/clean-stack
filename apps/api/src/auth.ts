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
  emailFor,
  enforcedProviderForDomain,
  findActiveMemberOrgId,
  findActiveMemberRole,
  findLatestLinkedAccount,
  findLatestPasskey,
  findMemberOf,
  findOrgOwnerUserId,
  findSsoProviderByProviderId,
  insertPersonalOrgWithOwner,
  scimConnectionOwner,
  setPendingEmail,
} from "./auth-queries";
import { buildSessionPayload } from "./auth-session-payload";
import { di } from "./container";
import {
  authorizeSubscriptionReference,
  subscriptionEventType,
} from "./modules/billing/application/subscription-events";
import { hasFeature, hasSeatAvailable } from "./modules/billing/config";
import { stripeClient } from "./modules/billing/infrastructure/stripe-client";
import { RequestSnapshots } from "./shared/auth/request-snapshots";
import { normalizeSamlConfig } from "./shared/auth/saml-config";
import { isSsoEnforcedFor } from "./shared/auth/sso-enforcement";
import {
  changedFieldsFrom,
  isDeactivation,
  SCIM_PATHS,
  SSO_PATHS,
  scimProviderIdFromToken,
} from "./shared/auth/sso-paths";
import { env } from "./shared/env";
import { emitEvent } from "./shared/event-emitter";
import { logger } from "./shared/logger";
import { assertSeat } from "./shared/middleware/billing.middleware";
import {
  IMPERSONATE_PATH,
  isBlockedDuringImpersonation,
} from "./shared/middleware/impersonation-blocklist";
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
 * The enterprise entitlement gate shared by `/sso/register` and
 * `/scim/generate-token`: both unlock the same paid capability, so both must refuse
 * the same way. Takes the org the REQUEST names — never one inferred from session
 * history — because that is the only org whose plan is actually being spent.
 */
async function assertSsoEntitlementFor(organizationId: string | undefined): Promise<void> {
  if (!organizationId) {
    throw new APIError("FORBIDDEN", { message: "SSO_ORGANIZATION_REQUIRED" });
  }
  const entitlements = await di.EntitlementsService.getEntitlements(organizationId);
  if (!hasFeature(entitlements, "sso")) {
    throw new APIError("FORBIDDEN", { message: "SSO_PLAN_REQUIRED" });
  }
}

/**
 * The seat cap itself: one question, one answer, for every surface that creates a
 * member. Callers differ only in how they refuse — the organization hooks throw
 * `AppErrorException` through `assertSeat`, the SCIM branch has to throw a
 * BetterAuth `APIError` with a SCIM-shaped body — and that difference must never
 * be allowed to become two different definitions of "is there a seat".
 * Centralised so the check is never duplicated across hooks (CLAUDE.md
 * reusability rule, §6 two-path trap).
 */
async function seatCapFor(
  orgId: string,
): Promise<{ available: boolean; activeMembers: number; maxMembers: number | null }> {
  const view = await di.EntitlementsService.getEntitlements(orgId);
  const activeMembers = await countActiveMembers(orgId);
  return {
    available: hasSeatAvailable(activeMembers, view.maxMembers),
    activeMembers,
    maxMembers: view.maxMembers,
  };
}

/**
 * The seat gate for every member-creation path that refuses with the app's own
 * error type (direct add, invitation acceptance, invitation creation).
 */
async function assertSeatAvailableFor(orgId: string): Promise<void> {
  const { activeMembers, maxMembers } = await seatCapFor(orgId);
  assertSeat(activeMembers, maxMembers);
}

/**
 * How long a value captured in `hooks.before`, or a row written by the request in
 * flight, may still be treated as belonging to that request. Generous enough that
 * no legitimate before→after round trip is ever cut off, short enough that a
 * stranded value cannot be picked up by a later, unrelated request.
 */
const SNAPSHOT_TTL_MS = 30_000;

/**
 * An RFC 7644 §3.12 error body. Every `/scim/v2/*` response an IdP parses has to
 * carry `schemas`/`status`/`detail` — Okta and Entra surface a generic "provider
 * error" for anything else, hiding the actual reason from the operator who has to
 * act on it. `@better-auth/scim` has its own `SCIMAPIError` for exactly this and
 * uses it throughout, but does not export it (the package exports `scim` and
 * `scimClient`, nothing else), so the shape is reproduced rather than imported.
 * `message` is carried alongside `detail` so the thrown error is not blank in logs
 * and telemetry — better-call reads `Error.message` from the body.
 */
const SCIM_ERROR_STATUS = { PAYMENT_REQUIRED: 402 } as const;

function scimError(status: keyof typeof SCIM_ERROR_STATUS, detail: string): APIError {
  return new APIError(status, {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    status: String(SCIM_ERROR_STATUS[status]),
    detail,
    message: detail,
  });
}

/**
 * Bridges `org.member.joined` for the SCIM provisioning path. `@better-auth/scim`
 * writes the member row with a raw `adapter.create({ model: "member" })`, so
 * `organizationHooks.afterAddMember` — where every other surface emits this event —
 * never fires: without this bridge an IdP-provisioned member leaves no audit row and
 * no webhook delivery (rule #6). Same aggregate and same payload shape as
 * `afterAddMember`; the provisioned user is the subject, the connection owner is the
 * actor (rule #7).
 *
 * The plugin's `createOrgMembership` silently no-ops when the user is already a member
 * (SCIM linking someone who joined by invitation), and an after-hook cannot tell the
 * two apart — `createdAt` can: a row this request wrote is seconds old. Without the
 * window, re-provisioning an existing member would emit a false "joined".
 */
async function emitScimMemberJoined(
  userId: string,
  organizationId: string,
  actorUserId: string | null,
): Promise<void> {
  const member = await findMemberOf(userId, organizationId);
  if (!member || member.createdAt.getTime() < Date.now() - SNAPSHOT_TTL_MS) return;
  await emit(
    EventTypes.ORG_MEMBER_JOINED,
    "member",
    member.id,
    {
      organizationId,
      userId,
      role: member.role,
      actorUserId: actorUserId ?? undefined,
    },
    organizationId,
  );
}

/**
 * Best-effort client IP from a BetterAuth hook's `ctx.headers` for audit-only
 * event payloads. NOT the trusted-proxy resolver (`resolveClientIp`, Hono layer,
 * unreachable from here) — acceptable because these emits are non-blocking audit.
 */
function clientIpFromHeaders(headers?: Headers): string | null {
  return headers?.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 45) ?? null;
}

/**
 * `hooks.before` snapshots a provider's org/domain right before `/sso/delete-provider`
 * removes the row — the endpoint's response is `{ success: true }` with no provider
 * data, and the row is already gone by the time `hooks.after` runs. Keyed on
 * `providerId` (unique per row) rather than the hook's `ctx.context`, since better-call
 * rebuilds parts of that object between `hooks.before` and `hooks.after` and reference
 * identity across the two isn't guaranteed. Read-and-delete in the after hook.
 */
const ssoProviderDeleteSnapshots = new RequestSnapshots<{
  organizationId: string | null;
  domain: string;
  issuer: string;
}>(SNAPSHOT_TTL_MS);

/**
 * Same read-before-delete snapshot as `ssoProviderDeleteSnapshots`, for
 * `/scim/delete-provider-connection`: the connection row (and its
 * `organizationId`) is gone by the time `hooks.after` runs. Keyed on
 * `providerId` and consumed only in that path's own after-branch — the key is
 * unique per row and the consumer is the same request, so freshness is the only
 * guard it needs.
 */
const scimConnectionDeleteSnapshots = new RequestSnapshots<string>(SNAPSHOT_TTL_MS);

/**
 * `DELETE /scim/v2/Users/:userId` is authenticated by a bearer token, so the real
 * actor (the connection owner) is only resolvable from `hooks.before`, while the
 * `org.member.removed` emit happens inside `organizationHooks.afterRemoveMember`,
 * which the organization plugin calls with the *removed* user as `user`.
 *
 * This one carries the organization id as well as the actor, and the consumer
 * checks it, because its key is the least trustworthy of the three: `userId`
 * comes straight off the request URL, the consumer fires on *every* member
 * removal in *every* org, and the SCIM endpoint has two paths that reach neither
 * `afterRemoveMember` nor any other consumer — a 404 for an unknown user, and a
 * user who holds no member row. Without the org check, one 404-ing DELETE from
 * any valid SCIM token would strand an entry that then names that token's owner
 * as the actor of an unrelated admin's kick, in an unrelated org — fabricated
 * provenance on a compliance-retention event.
 */
const scimDeprovisionActors = new RequestSnapshots<{
  actorUserId: string;
  organizationId: string;
}>(SNAPSHOT_TTL_MS);

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
          // SCIM deprovisioning reaches this hook too (`@better-auth/scim` calls it
          // after its own transaction), but bearer-token requests have no session, so
          // the plugin can only pass the removed user. `hooks.before` snapshotted the
          // connection owner — the real actor — under the deprovisioned user id.
          // The org check is what makes that safe to trust: this hook fires for every
          // removal in every org, and a snapshot whose org is not this one belongs to
          // some other request (see `scimDeprovisionActors`).
          const scimActor = scimDeprovisionActors.take(
            member.userId,
            (snapshot) => snapshot.organizationId === org.id,
          )?.actorUserId;
          await emit(
            EventTypes.ORG_MEMBER_REMOVED,
            "member",
            member.id,
            { organizationId: org.id, actorUserId: scimActor ?? user.id, userId: member.userId },
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

      // SSO enforcement: an org whose domain is verified and enforced rejects every
      // non-SSO email-bearing sign-in/sign-up path. Placed before the rate-limit
      // branch below — that branch `return`s for "/sign-in/email", so anything
      // added after it never runs for that path. Passkey (no email) is closed
      // separately in `databaseHooks.session.create.before`.
      const emailBearingPaths = ["/sign-in/email", "/sign-up/email", "/sign-in/magic-link"];
      if (emailBearingPaths.includes(path)) {
        const candidateEmail = body?.email as string | undefined;
        if (candidateEmail) {
          const enforced = await isSsoEnforcedFor(candidateEmail, enforcedProviderForDomain);
          if (enforced.isSome()) {
            throw new APIError("FORBIDDEN", {
              message: "SSO_REQUIRED",
              providerId: enforced.unwrap().providerId,
            });
          }
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
        await assertSsoEntitlementFor(body?.organizationId as string | undefined);

        // The plugin persists `domain` verbatim (no casing normalization on its side),
        // and every domain-based lookup (enforcedProviderForDomain) compares against a
        // lowercased email domain — normalize here so newly written rows are canonical.
        if (typeof body?.domain === "string") {
          body.domain = body.domain.toLowerCase();
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

      // R26: /sso/update-provider also persists `domain` verbatim (plugin source,
      // update-provider route) — same casing trap as /sso/register, same fix.
      if (path === SSO_PATHS.updateProvider) {
        if (typeof body?.domain === "string") {
          body.domain = body.domain.toLowerCase();
        }
        return;
      }

      if (path === SSO_PATHS.deleteProvider) {
        const providerId = body?.providerId as string | undefined;
        if (providerId) {
          const provider = await findSsoProviderByProviderId(providerId);
          if (provider) ssoProviderDeleteSnapshots.set(providerId, provider);
        }
        return;
      }

      if (path === SCIM_PATHS.deleteConnection) {
        const providerId = body?.providerId as string | undefined;
        if (providerId) {
          const owner = await scimConnectionOwner(providerId);
          if (owner.organizationId)
            scimConnectionDeleteSnapshots.set(providerId, owner.organizationId);
        }
        return;
      }

      // SCIM directory sync is part of the same enterprise entitlement as SSO, and
      // the token minted here is what unlocks `/scim/v2/*` for an IdP. Gated on the
      // same feature and in the same place as `/sso/register`: without this, a
      // Free-tier owner mints a token and provisions members through a surface that
      // never passes any billing gate.
      if (path === SCIM_PATHS.generateToken) {
        await assertSsoEntitlementFor(body?.organizationId as string | undefined);
        return;
      }

      // Seat cap for SCIM provisioning. `@better-auth/scim` writes the member row with
      // a raw `adapter.create({ model: "member" })`, so neither `beforeAddMember` nor
      // `beforeAcceptInvitation` — the two authoritative seat gates — ever fires. An
      // after-hook cannot cap anything (the row is already written), so the gate has to
      // live here, before the endpoint runs. It asks `seatCapFor` — the same predicate
      // the organization hooks ask through `assertSeatAvailableFor` — and only the
      // refusal differs: this is a SCIM protocol endpoint, so it owes an RFC 7644 error
      // body rather than the app's own.
      if (path === SCIM_PATHS.users && ctx.method === "POST") {
        const owner = await scimConnectionOwner(scimProviderIdFromToken(ctx.headers));
        // No org on the connection means no member row is written at all (the plugin's
        // `createOrgMembership` no-ops), and an unresolvable token is the endpoint's
        // own 401 to raise — neither is a seat concern.
        if (owner.organizationId) {
          const { available, maxMembers } = await seatCapFor(owner.organizationId);
          if (!available) {
            throw scimError("PAYMENT_REQUIRED", `Seat limit reached (${maxMembers ?? "∞"}).`);
          }
        }
        return;
      }

      // `organizationHooks.afterRemoveMember` DOES fire on SCIM deprovisioning, but the
      // organization plugin passes the *removed* user as its `user` argument on every
      // path, so the emitted `org.member.removed` would name the deprovisioned user as
      // its own actor. Snapshot the real actor — the connection owner — here, where the
      // bearer token is still readable, and let the hook prefer it (rule #7: the subject
      // is not the actor). Read-and-delete, same pattern as the snapshots above.
      if (path === SCIM_PATHS.user && ctx.method === "DELETE") {
        const userId = (ctx.params as Record<string, string> | undefined)?.userId;
        const owner = await scimConnectionOwner(scimProviderIdFromToken(ctx.headers));
        if (userId && owner.userId && owner.organizationId) {
          scimDeprovisionActors.set(userId, {
            actorUserId: owner.userId,
            organizationId: owner.organizationId,
          });
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
      const path = ctx.path;

      // sso.login.failure is the one event this hook emits on a rejected call, so it
      // must run before the early-return below — every other branch only sees success.
      if (
        ctx.context.returned instanceof APIError &&
        (path === SSO_PATHS.callback ||
          path === SSO_PATHS.callbackWithProvider ||
          path === SSO_PATHS.samlCallback ||
          path === SSO_PATHS.samlAcs)
      ) {
        const providerId = (ctx.params as Record<string, string> | undefined)?.providerId ?? null;
        const provider = providerId ? await findSsoProviderByProviderId(providerId) : undefined;
        // `organizationId` is what makes a public event deliverable: WebhookFanoutSubscriber
        // drops every event whose organizationId is none before it even reads the
        // visibility map, so a public `sso.login.failure` without it is undeliverable
        // and invisible in the customer's audit view. The provider row loaded above
        // already carries it — pass it, exactly like SSO_LOGIN_SUCCESS does.
        await emit(
          EventTypes.SSO_LOGIN_FAILURE,
          "sso_provider",
          providerId ?? "unknown",
          {
            actorUserId: null,
            providerId,
            domain: provider?.domain ?? "unknown",
            reason: ctx.context.returned.message,
            ip: clientIpFromHeaders(ctx.headers) ?? "unknown",
          },
          provider?.organizationId ?? null,
        );
      }

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

      if (
        path === SSO_PATHS.callback ||
        path === SSO_PATHS.callbackWithProvider ||
        path === SSO_PATHS.samlCallback ||
        path === SSO_PATHS.samlAcs
      ) {
        const session = ctx.context.newSession;
        if (session) {
          const params = ctx.params as Record<string, string> | undefined;
          const isSaml = path === SSO_PATHS.samlCallback || path === SSO_PATHS.samlAcs;
          let providerId = params?.providerId;
          if (!providerId) {
            const latest = await findLatestLinkedAccount(session.user.id);
            providerId = latest?.providerId;
          }
          await emit(
            EventTypes.SSO_LOGIN_SUCCESS,
            "user",
            session.user.id,
            {
              userId: session.user.id,
              providerId: providerId ?? "unknown",
              organizationId: session.session.activeOrganizationId ?? null,
              protocol: isSaml ? "saml" : "oidc",
              jitProvisioned: session.user.createdAt.getTime() > Date.now() - 10_000,
            },
            session.session.activeOrganizationId,
          );
        }
        return;
      }

      // SCIM endpoints authenticate with a bearer token — `ctx.context.session` is
      // empty here, so this branch must run before the session-actor early-return
      // below, and the actor is resolved from the connection row instead.
      if (path.startsWith(SCIM_PATHS.users) && ctx.method !== "GET") {
        const body = ctx.body as Record<string, unknown> | undefined;
        const providerId = scimProviderIdFromToken(ctx.headers);
        const owner = await scimConnectionOwner(providerId);
        const params = ctx.params as Record<string, string> | undefined;
        // POST/PUT return the SCIM user resource (`{ id, externalId }`); PATCH/DELETE
        // reply 204 with no body, so the subject id has to come from the route param.
        const returned = ctx.context.returned as { id: string; externalId?: string } | undefined;
        const subjectId = returned?.id ?? params?.userId;
        if (subjectId && owner.organizationId) {
          const base = {
            userId: subjectId,
            actorUserId: owner.userId,
            organizationId: owner.organizationId,
            scimProviderId: providerId,
            externalId: returned?.externalId ?? null,
          };
          if (ctx.method === "POST") {
            await emit(EventTypes.SCIM_USER_CREATED, "user", subjectId, base, owner.organizationId);
            await emitScimMemberJoined(subjectId, owner.organizationId, owner.userId);
          } else if (ctx.method === "DELETE") {
            await emit(
              EventTypes.SCIM_USER_DEPROVISIONED,
              "user",
              subjectId,
              base,
              owner.organizationId,
            );
          } else if (isDeactivation(body)) {
            await emit(
              EventTypes.SCIM_USER_DEACTIVATED,
              "user",
              subjectId,
              base,
              owner.organizationId,
            );
          } else {
            await emit(
              EventTypes.SCIM_USER_UPDATED,
              "user",
              subjectId,
              { ...base, changedFields: changedFieldsFrom(body) },
              owner.organizationId,
            );
          }
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

      if (path === SSO_PATHS.register) {
        const provider = ctx.context.returned as {
          providerId: string;
          organizationId: string | null;
          domain: string;
          issuer: string;
          samlConfig?: unknown;
        };
        if (provider.organizationId) {
          await emit(
            EventTypes.SSO_PROVIDER_REGISTERED,
            "sso_provider",
            provider.providerId,
            {
              actorUserId: userId,
              organizationId: provider.organizationId,
              providerId: provider.providerId,
              protocol: provider.samlConfig ? "saml" : "oidc",
              domain: provider.domain,
              issuer: provider.issuer,
            },
            provider.organizationId,
          );
        }
        return;
      }
      if (path === SSO_PATHS.updateProvider) {
        const provider = ctx.context.returned as {
          providerId: string;
          organizationId: string | null;
        };
        if (provider.organizationId) {
          const body = (ctx.body as Record<string, unknown> | undefined) ?? {};
          const changedFields = Object.keys(body).filter((key) => key !== "providerId");
          await emit(
            EventTypes.SSO_PROVIDER_UPDATED,
            "sso_provider",
            provider.providerId,
            {
              actorUserId: userId,
              organizationId: provider.organizationId,
              providerId: provider.providerId,
              changedFields,
            },
            provider.organizationId,
          );
        }
        return;
      }
      if (path === SSO_PATHS.deleteProvider) {
        const providerId = (ctx.body as Record<string, unknown> | undefined)?.providerId as
          | string
          | undefined;
        const snapshot = providerId ? ssoProviderDeleteSnapshots.take(providerId) : undefined;
        if (providerId && snapshot?.organizationId) {
          await emit(
            EventTypes.SSO_PROVIDER_DELETED,
            "sso_provider",
            providerId,
            {
              actorUserId: userId,
              organizationId: snapshot.organizationId,
              providerId,
            },
            snapshot.organizationId,
          );
        }
        return;
      }
      if (path === SSO_PATHS.verifyDomain) {
        const providerId = (ctx.body as Record<string, unknown> | undefined)?.providerId as
          | string
          | undefined;
        if (providerId) {
          const provider = await findSsoProviderByProviderId(providerId);
          if (provider?.organizationId) {
            await emit(
              EventTypes.SSO_DOMAIN_VERIFIED,
              "sso_provider",
              providerId,
              {
                actorUserId: userId,
                organizationId: provider.organizationId,
                providerId,
                domain: provider.domain,
              },
              provider.organizationId,
            );
          }
        }
        return;
      }

      // A SCIM token is an issued credential: its creation/revocation audits like a PAT.
      if (path === SCIM_PATHS.generateToken) {
        const body = ctx.body as Record<string, unknown> | undefined;
        const providerId = body?.providerId as string | undefined;
        const organizationId = body?.organizationId as string | undefined;
        if (providerId && organizationId) {
          await emit(
            EventTypes.SCIM_CONNECTION_CREATED,
            "scim_provider",
            providerId,
            { actorUserId: userId, organizationId, providerId },
            organizationId,
          );
        }
        return;
      }
      if (path === SCIM_PATHS.deleteConnection) {
        const providerId = (ctx.body as Record<string, unknown> | undefined)?.providerId as
          | string
          | undefined;
        const organizationId = providerId
          ? scimConnectionDeleteSnapshots.take(providerId)
          : undefined;
        if (providerId && organizationId) {
          await emit(
            EventTypes.SCIM_CONNECTION_DELETED,
            "scim_provider",
            providerId,
            { actorUserId: userId, organizationId, providerId },
            organizationId,
          );
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
        before: async (session, context) => {
          // SSO enforcement, non-email-bearing leg: passkey sign-in carries no email
          // (the `hooks.before` step only sees the email-bearing paths), and this hook
          // fires for every session creation whatever the path.
          //
          // The discriminator is the REQUEST, never the user. Any user-linkage query
          // ("does this user own an SSO account?") answers a different question: once
          // a user has signed in through the IdP once, they own an SSO `account` row
          // forever, so a later passkey ceremony for the same user would be waved
          // through — which is exactly the deprovisioning guarantee enforcement sells.
          // BetterAuth passes the endpoint context as the second argument
          // (`createWithHooks` → `getCurrentAuthContext()`, better-auth/dist/db/with-hooks.mjs),
          // and its `path` is the endpoint's own registered path — so the SSO callback
          // is identifiable, and every other path is enforced.
          //
          // Impersonation is exempt because it is not the enforced user authenticating:
          // the session is minted for a platform admin who already passed the admin
          // gate, and blocking it would only remove a support capability.
          const createdBySso =
            context?.path === SSO_PATHS.callback ||
            context?.path === SSO_PATHS.callbackWithProvider ||
            context?.path === SSO_PATHS.samlCallback ||
            context?.path === SSO_PATHS.samlAcs ||
            context?.path === IMPERSONATE_PATH;
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

// Type-only anchors: the inferred `auth` type references these packages' types, and TS
// can only name them portably from a direct dependency. @simplewebauthn/server must
// therefore stay on the exact major @better-auth/passkey depends on (13 as of passkey
// 1.7.6): a direct 14 resolves to a second copy and brings TS2883 back.
import "@simplewebauthn/server";
import "zod/v4/core";
import { passkey } from "@better-auth/passkey";
import { type SCIMEndpoints, type SCIMPlugin, scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import { stripe } from "@better-auth/stripe";
import { ac, isPersonalOrg, type OrgRole, roles } from "@packages/access-control";
import { CONSENT_COOKIE_NAME } from "@packages/cookie-consent";
import { db, sql, type Transaction } from "@packages/drizzle";
import { type EventType, EventTypes } from "@packages/events";
import { DEFAULT_LOCALE, type Locale, toLocale } from "@packages/i18n";
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
  findScimUser,
  findSsoProviderByProviderId,
  insertPersonalOrgWithOwner,
  isVerifiedSsoDomainOf,
  type ScimUserSnapshot,
  scimConnectionCreator,
  setPendingEmail,
} from "./auth-queries";
import { buildSessionPayload } from "./auth-session-payload";
import { di } from "./container";
import {
  authorizeSubscriptionReference,
  subscriptionEventType,
} from "./modules/billing/application/subscription-events";
import { stripeClient } from "./modules/billing/infrastructure/stripe-client";
import { RequestSnapshots } from "./shared/auth/request-snapshots";
import { normalizeSamlConfig } from "./shared/auth/saml-config";
import { scimIdentityResolver, scimMembershipProjection } from "./shared/auth/scim-membership";
import { isSsoEnforcedFor } from "./shared/auth/sso-enforcement";
import {
  changedFieldsFrom,
  isSamlCallbackPath,
  isSsoCallbackPath,
  SCIM_PATHS,
  SSO_PATHS,
  scimUserChange,
} from "./shared/auth/sso-paths";
import { hasFeature, hasSeatAvailable } from "./shared/entitlements";
import { env } from "./shared/env";
import { emitEvent, emitEventBestEffort } from "./shared/event-emitter";
import { logger } from "./shared/logger";
import { assertSeat } from "./shared/middleware/billing.middleware";
import {
  IMPERSONATE_PATH,
  isBlockedDuringImpersonation,
} from "./shared/middleware/impersonation-blocklist";
import { MIN_PASSWORD_LENGTH, validatePassword } from "./shared/password-policy";
import type { EmailTemplates, TemplateVariables } from "./shared/ports/email.port";
import { getClientIp } from "./shared/request-context";

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

    const emitUserCreated = async () => {
      if (!signupUser) return;
      await emit(
        EventTypes.USER_CREATED,
        "user",
        userId,
        { userId, email: signupUser.email, name: signupUser.name },
        null,
        tx,
      );
    };

    const existingOrgId = await findActiveMemberOrgId(userId, tx);
    if (existingOrgId) {
      await emitUserCreated();
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
    await emitUserCreated();
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
 * `emit` for the security signals a before-hook raises on its way to refusing the
 * request: the refusal is the enforcement, the event is telemetry, so a failed
 * enqueue (already captured by the outbox) is logged and the refusal still happens.
 */
async function emitBestEffort<TPayload>(
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
): Promise<void> {
  await emitEventBestEffort(
    di.IOutboxRepository,
    eventType,
    aggregateType,
    aggregateId,
    payload,
    "security event emit failed, still refusing the request",
    { eventType },
  );
}

/**
 * The enterprise entitlement gate on `/sso/register`. Takes the org the REQUEST
 * names, never one inferred from session history, because that is the only org
 * whose plan is actually being spent. The SCIM half of the same paid capability is
 * gated where its connection is created, `requireFeature("sso")` on the
 * `/settings/organization/scim-connection` routes.
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
 * member. Callers differ only in how they refuse, the organization hooks throw
 * `AppErrorException` through `assertSeat`, the SCIM projection has to throw a
 * BetterAuth `APIError` with a SCIM-shaped body, and that difference must never
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
 * Bridges `org.member.joined` for the SCIM provisioning path. The member row is
 * written by `scimMembershipProjection` through the plugin's transaction adapter,
 * so `organizationHooks.afterAddMember`, where every other surface emits this
 * event, never fires: without this bridge an IdP-provisioned member leaves no audit
 * row and no webhook delivery (rule #6). Same aggregate and same payload shape as
 * `afterAddMember`; the provisioned user is the subject, the connection owner is the
 * actor (rule #7).
 *
 * The projection leaves an existing membership alone (SCIM linking someone who
 * joined by invitation), and an after-hook cannot tell the two apart, `createdAt`
 * can: a row this request wrote is seconds old. Without the window,
 * re-provisioning an existing member would emit a false "joined".
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
 * The events of a successful `/scim/v2/Users` write: the SCIM lifecycle event, and
 * the membership change the projection made in the same transaction. Runs only
 * after the plugin committed, so a refused or rolled-back request emits nothing.
 *
 * The subject is the Better Auth user, never the SCIM resource id the directory
 * sees; the actor is the connection's creator (rule #7), a bearer request having
 * no session. A creation reads the stored row back through the id the response
 * carries; every other write reads the snapshot `hooks.before` took, the only
 * record of a deleted user and the only "before" a deactivation can be told from.
 */
async function emitScimUserEvents(
  method: string | undefined,
  returned: unknown,
  params: unknown,
  body: Record<string, unknown> | undefined,
): Promise<void> {
  if (!method || returned instanceof APIError) return;

  const scimUserId =
    method === "POST"
      ? (returned as { id?: string } | undefined)?.id
      : (params as Record<string, string> | undefined)?.userId;
  if (!scimUserId) return;

  const before = method === "POST" ? undefined : scimUserSnapshots.take(scimUserId);
  const after = method === "DELETE" ? undefined : await findScimUser(scimUserId);
  const subject = after ?? before;
  if (!subject) return;

  const change = scimUserChange(method, before, after);
  if (!change) return;

  const { userId, organizationId, connectionId, externalId } = subject;
  const actorUserId = await scimConnectionCreator(connectionId);
  const base = { userId, actorUserId, organizationId, scimProviderId: connectionId, externalId };
  const eventType = {
    created: EventTypes.SCIM_USER_CREATED,
    updated: EventTypes.SCIM_USER_UPDATED,
    deactivated: EventTypes.SCIM_USER_DEACTIVATED,
    deprovisioned: EventTypes.SCIM_USER_DEPROVISIONED,
  }[change];
  const payload = change === "updated" ? { ...base, changedFields: changedFieldsFrom(body) } : base;
  await emit(eventType, "user", userId, payload, organizationId);

  await emitScimMemberJoined(userId, organizationId, actorUserId);

  const removedMemberId = before?.memberId;
  if (!removedMemberId || (await findMemberOf(userId, organizationId))) return;
  await emit(
    EventTypes.ORG_MEMBER_REMOVED,
    "member",
    removedMemberId,
    { organizationId, actorUserId, userId },
    organizationId,
  );
}

/**
 * `billing.subscription.*` for a Stripe subscription lifecycle callback. Stripe is the
 * caller, so the actor is resolved as the org owner, the one member who can have
 * started or changed the subscription.
 */
async function emitSubscriptionEvent(
  eventType: EventType,
  subscription: {
    id: string;
    referenceId: string;
    status: string;
    periodEnd?: Date | null;
  },
  tier: string,
): Promise<void> {
  const actorUserId = await findOrgOwnerUserId(subscription.referenceId);
  await emit(
    eventType,
    "subscription",
    subscription.id,
    {
      organizationId: subscription.referenceId,
      subscriptionId: subscription.id,
      tier,
      status: subscription.status,
      actorUserId,
      currentPeriodEnd: subscription.periodEnd ?? null,
    },
    subscription.referenceId,
  );
}

/**
 * Client IP for event payloads and compliance records, as resolved by the
 * trusted-proxy resolver for the current request (`app.ts` puts it in the request
 * context, a BetterAuth hook has no Hono context of its own). Never read
 * `X-Forwarded-For` here: any client can send one.
 */
function requestClientIp(): string | null {
  return getClientIp()?.slice(0, 45) ?? null;
}

/**
 * `hooks.before` snapshots a provider's org/domain right before `/sso/delete-provider`
 * removes the row, the endpoint's response is `{ success: true }` with no provider
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
 * The stored SCIM User a `PUT`, `PATCH` or `DELETE /scim/v2/Users/:userId` is about
 * to change, read in `hooks.before`: a deletion leaves nothing to read afterwards,
 * and a deactivation is only visible as the difference between the two states.
 * Keyed on the SCIM user id from the path, and only ever consumed by the after-hook
 * of a request that succeeded, which proves the plugin found that user inside the
 * caller's own connection. The snapshot is a database read, never request input,
 * so a stranded entry cannot carry anything a caller chose.
 */
const scimUserSnapshots = new RequestSnapshots<ScimUserSnapshot & { memberId: string | undefined }>(
  SNAPSHOT_TTL_MS,
);

/**
 * The two provider-writing SSO endpoints persist `domain` verbatim and merge SAML
 * fields as sent, so both get the same treatment before the plugin sees the body:
 * the domain lowercased (every lookup compares against a lowercased email domain)
 * and the SAML config forced to its signed, sha256 form.
 */
function normalizeSsoProviderBody(body: Record<string, unknown> | undefined): void {
  if (typeof body?.domain === "string") {
    body.domain = body.domain.toLowerCase();
  }

  if (!body?.samlConfig || typeof body.samlConfig !== "object") return;

  const normalized = normalizeSamlConfig(body.samlConfig as Record<string, unknown>);
  if (normalized.isFailure) {
    throw new APIError("BAD_REQUEST", { message: normalized.getError().message });
  }
  body.samlConfig = normalized.getValue();
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
 * Resolves the locale to write a message in when the hook only hands over an
 * address. Magic-link sign-in is the one auth flow with no user object in
 * scope; an address with no account yet legitimately falls back to the
 * default rather than failing the send.
 */
/**
 * The locale BetterAuth hands over on its user objects. `locale` is an additional field
 * the plugin types do not know about, hence the narrow read.
 */
function localeOf(user: object): Locale {
  return toLocale((user as { locale?: unknown }).locale);
}

async function localeForEmail(email: string): Promise<Locale> {
  const found = await di.IProfileStore.findLocaleByEmail(email);
  if (found.isFailure) return DEFAULT_LOCALE;
  const locale = found.getValue();
  return locale.isSome() ? locale.unwrap() : DEFAULT_LOCALE;
}

/**
 * Sends a transactional email through `IEmailService` and surfaces failures
 * as a thrown `Error`, the only signal available inside BetterAuth's
 * `async () => void` hook signature. Transport-not-configured is downgraded
 * to a warning (dev/test without Resend configured should not crash).
 */
async function dispatchEmail<K extends keyof EmailTemplates>(
  template: K,
  to: string,
  variables: EmailTemplates[K] & TemplateVariables,
  idempotencyKey: string,
  locale: Locale,
): Promise<void> {
  const result = await di.IEmailService.sendTemplate(template, to, variables, {
    idempotencyKey,
    locale,
  });
  if (result.isFailure) {
    const error = result.getError();
    if (error.code === "EMAIL_PROVIDER_FAILURE") {
      // BetterAuth hook signature is `async () => void`, no Result propagation possible; throw is the only signal.
      throw new Error(`email send failed (${template}): ${error.message}`);
    }
    logger.warn({ template, to, code: error.code }, "email skipped, transport not configured");
  }
}

/**
 * `@better-auth/scim` leaks an unexported interface (`SCIMDiscoveryAttribute`)
 * through the response types of its two schema-discovery endpoints, and the
 * exported `auth` type then cannot be named (TS4023). Both endpoints are served to
 * directories over HTTP and never called through `auth.api`, so the plugin is typed
 * without them: an annotation that only drops keys, the runtime object is untouched.
 */
type ScimPluginWithoutDiscoveryTypes = Omit<SCIMPlugin, "endpoints"> & {
  endpoints: Omit<SCIMEndpoints, "getSCIMSchemas" | "getSCIMSchema">;
};

// Plugin-managed connections: one per organization, created, rotated and
// decommissioned by `ScimConnectionService` behind the owner-only
// `/settings/organization/scim-connection` routes. The organization id is the
// provisioning domain, and the projection is what turns a directory's users into
// members of it (the plugin itself knows nothing of organizations).
const scimPlugin: ScimPluginWithoutDiscoveryTypes = scim({
  connections: [],
  managedConnections: {
    credentialHashSecret:
      env.SCIM_CREDENTIAL_HASH_SECRET ?? "dev-only-scim-credential-secret-not-for-production-use",
  },
  identity: scimIdentityResolver({ seatCapFor, isVerifiedSsoDomainOf }),
  projection: scimMembershipProjection({ seatCapFor, isVerifiedSsoDomainOf }),
});

const authOptions = {
  appName: "clean-stack",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  rateLimit: { enabled: false },

  // `transaction: true` is required by `@better-auth/scim`, which refuses to start
  // without native transactions: a directory change and the membership it
  // projects must commit or roll back together.
  database: drizzleAdapter(db, { provider: "pg", transaction: true }),

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
        await db.transaction(async (tx) => {
          await setPendingEmail(user.id, newEmail, tx);
          await emit(
            EventTypes.USER_EMAIL_CHANGE_REQUESTED,
            "user",
            user.id,
            { userId: user.id, newEmail },
            null,
            tx,
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
        localeOf(user),
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
        localeOf(user),
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
          await emitSubscriptionEvent(
            EventTypes.BILLING_SUBSCRIPTION_CREATED,
            subscription,
            plan.name,
          );
        },
        onSubscriptionUpdate: async ({ subscription }) => {
          await emitSubscriptionEvent(
            subscriptionEventType(subscription.status),
            subscription,
            subscription.plan,
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
          await localeForEmail(email),
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
          // SCIM deprovisioning never reaches this hook: the SCIM projection removes
          // the member row itself and `hooks.after` emits for it, with the
          // connection owner as the actor.
          const actorUserId = user.id;
          await emit(
            EventTypes.ORG_MEMBER_REMOVED,
            "member",
            member.id,
            { organizationId: org.id, actorUserId, userId: member.userId },
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
              { organizationId: org.id, actorUserId },
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
        // BetterAuth routes invitation acceptance through `afterAcceptInvitation`, without this,
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
        // Rendered in the inviter's locale, not the invitee's: an invitee with
        // no account yet has no locale of their own to read.
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
          localeOf(inviter.user),
        );
      },
    }),
    sso({
      domainVerification: { enabled: true },
      defaultOverrideUserInfo: false,
      organizationProvisioning: { disabled: false, defaultRole: "member" },
      // `providersLimit` only ever receives `user` (no ctx, no request body, verified
      // against the plugin's dist), so it cannot see which org a registration targets.
      // The business-tier gate lives in hooks.before on "/sso/register" instead, where
      // body.organizationId is available; this stays a flat anti-abuse ceiling per user.
      providersLimit: 10,
    }),
    scimPlugin,
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
      // branch below, that branch `return`s for "/sign-in/email", so anything
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

      // Credential-stuffing: per-account rate-limit on sign-in (fail-closed, store error → 503)
      if (path === "/sign-in/email") {
        const email = body?.email as string | undefined;
        if (!email) return;
        const ip = requestClientIp() ?? "unknown";
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
            await emitBestEffort(
              EventTypes.SECURITY_RATE_LIMIT_EXCEEDED,
              "rate_limit",
              `auth-sign-in-account:${email}`,
              { actorUserId: null, ip, policyName: "auth-sign-in-account", path, method: "POST" },
            );
          }
          throw new APIError("TOO_MANY_REQUESTS", { message: "Too many login attempts" });
        }
        return;
      }

      // D4 business-tier gate: `providersLimit` cannot see the target org (only `user`
      // is passed), so the gate lives here where `body.organizationId` is the one the
      // request actually names, never inferred from session history.
      // D8 SAML hardening runs after the gate: a request refused for lack of
      // entitlement need not have its body rewritten first.
      if (path === SSO_PATHS.register) {
        await assertSsoEntitlementFor(body?.organizationId as string | undefined);
        normalizeSsoProviderBody(body);
        return;
      }

      // R26: /sso/update-provider also persists `domain` verbatim (plugin source,
      // update-provider route), same casing trap as /sso/register, same fix.
      //
      // Post-review hardening: the plugin's own update handler (`mergeSAMLConfig`)
      // merges every SAML field as `updates.X ?? current.X` and only re-validates
      // `signatureAlgorithm`/`digestAlgorithm` when the caller sends them, an admin
      // could PATCH `{ wantAssertionsSigned: false, signatureAlgorithm: "sha1" }` and
      // it would persist untouched, undoing the register-time hardening below. Run
      // the same `normalizeSamlConfig` here. It is deliberately safe for a *partial*
      // update because of how it's written: identity fields (entryPoint, issuer,
      // cert, …) pass through the `{ ...input }` spread only when the caller sent
      // them, an update that never mentions `entryPoint` still merges to
      // `current.entryPoint` on the plugin side, unclobbered. Security fields
      // (`wantAssertionsSigned`, `authnRequestsSigned`, `signatureAlgorithm`,
      // `digestAlgorithm`) are unconditionally forced to their strong values every
      // time `samlConfig` is touched at all, whether or not the caller sent them,
      // that's intentional, not a bug: a partial update is exactly the vector this
      // finding used, so "untouched" security fields get re-affirmed, not skipped.
      if (path === SSO_PATHS.updateProvider) {
        normalizeSsoProviderBody(body);
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

      if (path === SCIM_PATHS.user && ctx.method !== "GET") {
        const scimUserId = (ctx.params as Record<string, string> | undefined)?.userId;
        const scimUser = scimUserId ? await findScimUser(scimUserId) : undefined;
        if (scimUserId && scimUser) {
          const member = await findMemberOf(scimUser.userId, scimUser.organizationId);
          scimUserSnapshots.set(scimUserId, { ...scimUser, memberId: member?.id });
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

        // Disposable email check (fail-open, DNS error → allow + warn)
        if (env.DISPOSABLE_EMAIL_BLOCK_ENABLED && actorEmail) {
          const d = await di.IDisposableEmailService.isDisposable(actorEmail);
          if (d.isFailure) {
            logger.warn({ err: d.getError() }, "disposable-email check failed, failing open");
          } else if (d.getValue()) {
            await emitBestEffort(EventTypes.SECURITY_SIGNUP_REJECTED, "security", actorEmail, {
              actorUserId: null,
              email: actorEmail,
              ip: requestClientIp(),
              reason: "disposable_email" as const,
            });
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
        // the session middleware), load it explicitly so the audit actor is the real user.
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
      if (result.isNone()) return;

      const violation = result.unwrap();
      if (violation.isBreach) {
        await emitBestEffort(EventTypes.SECURITY_PASSWORD_BREACHED, "security", path, {
          actorUserId,
          email: actorEmail ?? null,
          ip: requestClientIp(),
          path,
        });
      }
      throw new APIError("UNPROCESSABLE_ENTITY", { message: violation.message });
    }),
    after: createAuthMiddleware(async (ctx) => {
      const path = ctx.path;
      const body = ctx.body as Record<string, unknown> | undefined;

      // sso.login.failure is the one event this hook emits on a rejected call, so it
      // must run before the early-return below, every other branch only sees success.
      if (ctx.context.returned instanceof APIError && isSsoCallbackPath(path)) {
        const providerId = (ctx.params as Record<string, string> | undefined)?.providerId ?? null;
        const provider = providerId ? await findSsoProviderByProviderId(providerId) : undefined;
        // `organizationId` is what makes a public event deliverable: WebhookFanoutSubscriber
        // drops every event whose organizationId is none before it even reads the
        // visibility map, so a public `sso.login.failure` without it is undeliverable
        // and invisible in the customer's audit view. The provider row loaded above
        // already carries it, pass it, exactly like SSO_LOGIN_SUCCESS does.
        await emit(
          EventTypes.SSO_LOGIN_FAILURE,
          "sso_provider",
          providerId ?? "unknown",
          {
            actorUserId: null,
            providerId,
            domain: provider?.domain ?? "unknown",
            reason: ctx.context.returned.message,
            ip: requestClientIp() ?? "unknown",
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

      if (isSsoCallbackPath(path)) {
        const session = ctx.context.newSession;
        if (session) {
          const params = ctx.params as Record<string, string> | undefined;
          const isSaml = isSamlCallbackPath(path);
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

      // SCIM endpoints authenticate with a bearer token, `ctx.context.session` is
      // empty here, so this branch must run before the session-actor early-return
      // below, and the actor is resolved from the connection instead.
      if (path.startsWith(SCIM_PATHS.users) && ctx.method !== "GET") {
        await emitScimUserEvents(ctx.method, ctx.context.returned, ctx.params, body);
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
          const ip = requestClientIp() ?? undefined;
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
        const changes: Record<string, unknown> = {};
        if (typeof body?.name === "string") changes.name = body.name;
        if (typeof body?.image === "string") changes.image = body.image;
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
          const changedFields = Object.keys(body ?? {}).filter((key) => key !== "providerId");
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
        const providerId = body?.providerId as string | undefined;
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
        const providerId = body?.providerId as string | undefined;
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
          await db.transaction(async (tx) => {
            const cleared = await clearConfirmedPendingEmail(user.id, user.email, tx);
            if (!cleared) return;
            await emit(
              EventTypes.USER_PROFILE_UPDATED,
              "user",
              user.id,
              { userId: user.id, changes: { email: user.email } },
              null,
              tx,
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
          const createdBySso =
            isSsoCallbackPath(context?.path) || context?.path === IMPERSONATE_PATH;
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
          const trusted = { ...session, ipAddress: requestClientIp() };
          if (session.activeOrganizationId) return { data: trusted };

          try {
            const orgId = await ensurePersonalOrgFor(session.userId);
            return { data: { ...trusted, activeOrganizationId: orgId } };
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

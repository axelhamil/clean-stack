import { CONSENT_COOKIE_NAME } from "@packages/cookie-consent";
import { EventTypes } from "@packages/events";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { di } from "../../container";
import {
  isSamlCallbackPath,
  isSsoCallbackPath,
  SCIM_PATHS,
  SSO_PATHS,
} from "../../shared/auth/sso-paths";
import { logger } from "../../shared/logger";
import { emit } from "../emit";
import {
  findLatestLinkedAccount,
  findLatestPasskey,
  findSsoProviderByProviderId,
} from "../queries";
import { emitScimUserEvents } from "../scim-events";
import { ssoProviderDeleteSnapshots } from "../snapshots";
import { requestClientIp } from "../visitor";

const TOTP_VERIFY_PATH = "/two-factor/verify-totp";

function readCookieFromHeaders(headers: Headers | undefined, name: string): string | undefined {
  const raw = headers?.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export const afterHook = createAuthMiddleware(async (ctx) => {
  const path = ctx.path;
  const body = ctx.body as Record<string, unknown> | undefined;

  const totpUserId = ctx.context.newSession?.user.id;
  if (path === TOTP_VERIFY_PATH && totpUserId && typeof body?.code === "string") {
    await di.ITotpVerifier.consume(totpUserId, body.code);
  }

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

  if (path === "/verify-email") {
    const verified = ctx.context.newSession?.user;
    if (verified?.emailVerified) {
      await emit(EventTypes.USER_EMAIL_VERIFIED, "user", verified.id, {
        userId: verified.id,
        email: verified.email,
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
    const passkeyId = body?.id;
    if (typeof passkeyId === "string") {
      await emit(EventTypes.USER_PASSKEY_REMOVED, "user", userId, { userId, passkeyId });
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
});

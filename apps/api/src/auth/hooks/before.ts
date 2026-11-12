import { EventTypes } from "@packages/events";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { normalizeSamlConfig } from "../../shared/auth/saml-config";
import { isSsoEnforcedFor } from "../../shared/auth/sso-enforcement";
import { isSsoCallbackPath, SCIM_PATHS, SSO_PATHS } from "../../shared/auth/sso-paths";
import { isBlockedDuringImpersonation } from "../../shared/middleware/impersonation-blocklist";
import { validatePassword } from "../../shared/password-policy";
import type { AuthDeps } from "../deps";
import type { AuthHelpers } from "../helpers";
import {
  enforcedProviderForDomain,
  findMemberOf,
  findScimUser,
  findSsoProviderByProviderId,
} from "../queries";
import { requestClientIp } from "../visitor";

const OAUTH_CALLBACK_PATH = "/callback/:id";

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

export type SessionReader = (headers: Headers) => Promise<{
  session?: { impersonatedBy?: string | null } | null;
  user: { id: string; email: string; name: string };
} | null>;

export function createBeforeHook(
  deps: Pick<
    AuthDeps,
    "rateLimiter" | "disposableEmail" | "passwordBreach" | "logger" | "settings"
  >,
  helpers: Pick<
    AuthHelpers,
    "emitBestEffort" | "refuseDeniedVisitor" | "assertSsoEntitlementFor" | "snapshots"
  >,
  readSession: SessionReader,
) {
  const { emitBestEffort, refuseDeniedVisitor, assertSsoEntitlementFor } = helpers;
  const { scimUserSnapshots, ssoProviderDeleteSnapshots } = helpers.snapshots;

  return createAuthMiddleware(async (ctx) => {
    const path = ctx.path;
    const body = ctx.body as Record<string, unknown> | undefined;

    if (isBlockedDuringImpersonation(path) && ctx.headers) {
      const current = await readSession(ctx.headers);
      if (current?.session?.impersonatedBy) {
        throw new APIError("FORBIDDEN", { message: "IMPERSONATION_ACTION_FORBIDDEN" });
      }
    }

    const emailBearingPaths = ["/sign-in/email", "/sign-up/email", "/sign-in/magic-link"];
    if (
      emailBearingPaths.includes(path) ||
      isSsoCallbackPath(path) ||
      path === OAUTH_CALLBACK_PATH
    ) {
      await refuseDeniedVisitor(path, null);
    }

    // SSO enforcement: an org whose domain is verified and enforced rejects every
    // non-SSO email-bearing sign-in/sign-up path. Placed before the rate-limit
    // branch below, that branch `return`s for "/sign-in/email", so anything
    // added after it never runs for that path. Passkey (no email) is closed
    // separately in `databaseHooks.session.create.before`.
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
      const rl = await deps.rateLimiter.consume(`auth-sign-in:account:${email}`, [
        {
          policyName: "auth-sign-in-account",
          windowSec: deps.settings.signInAccount.windowSec,
          maxRequests: deps.settings.signInAccount.maxRequests,
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
      if (deps.settings.disposableEmailBlockEnabled && actorEmail) {
        const d = await deps.disposableEmail.isDisposable(actorEmail);
        if (d.isFailure) {
          deps.logger.warn({ err: d.getError() }, "disposable-email check failed, failing open");
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
      const session = ctx.headers ? await readSession(ctx.headers) : null;
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
      deps.passwordBreach,
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
  });
}

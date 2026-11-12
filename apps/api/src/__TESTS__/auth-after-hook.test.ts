import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ConsentError } from "@modules/consents/application/ports/consent.port";
import { CONSENT_COOKIE_NAME } from "@packages/cookie-consent";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { APIError } from "better-auth/api";
import type { ITotpVerifier } from "../shared/ports/totp-verifier.port";
import { fakeAuthDeps, fakeAuthQueries, outermostUnitOfWork } from "./fake-auth-deps";

const outbox = mockPort<IOutboxRepository>();
const totp = mockPort<ITotpVerifier>();
const reconcile = mock(
  async (_subjectId: string, _userId: string): Promise<Result<void, ConsentError>> => Result.ok(),
);
const { unitOfWork } = mockUnitOfWork();

const realDrizzle = await import("@packages/drizzle");
mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  lockForTransaction: async () => undefined,
}));

const findLatestPasskey = mock(async () => ({ id: "passkey-1", deviceType: "multiDevice" }));
const findLatestLinkedAccount = mock(
  async (): Promise<
    { id: string; providerId: string; accountId: string; createdAt: Date } | undefined
  > => undefined,
);
const findSsoProviderByProviderId = mock(async () => ({
  organizationId: "org-1",
  domain: "acme.test",
  issuer: "https://idp.acme.test",
}));
const SCIM_USER = {
  userId: "user-9",
  connectionId: "connection-1",
  organizationId: "org-1",
  externalId: "ext-9",
  active: true,
};
const findScimUser = mock(async () => SCIM_USER);
const findMemberOf = mock(
  async (): Promise<{ id: string; role: string; createdAt: Date } | undefined> => ({
    id: "member-9",
    role: "member",
    createdAt: new Date(),
  }),
);
const findActiveMemberOrgId = mock(async (): Promise<string | undefined> => "org-1");
const insertPersonalOrgWithOwner = mock(async () => undefined);

const { createAuth } = await import("../auth/create-auth");
const auth = createAuth(
  fakeAuthDeps({
    queries: fakeAuthQueries({
      findLatestPasskey,
      findLatestLinkedAccount,
      findSsoProviderByProviderId,
      findScimUser,
      findMemberOf,
      scimConnectionCreator: async () => "owner-1",
      findActiveMemberOrgId,
      insertPersonalOrgWithOwner,
    }),
    outbox,
    uow: outermostUnitOfWork(unitOfWork),
    totp,
    consents: { reconcile },
  }),
);
const { SCIM_PATHS, SSO_PATHS } = await import("../auth/sso-paths");

const SESSION = {
  user: { id: "user-1", email: "user@example.com", createdAt: new Date() },
  session: { id: "session-1", activeOrganizationId: "org-1" },
};

interface HookCall {
  path: string;
  method?: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  headers?: Headers;
  session?: unknown;
  newSession?: unknown;
  returned?: unknown;
}

function runAfter(call: HookCall) {
  const after = auth.options.hooks?.after;
  if (!after) throw new Error("auth has no after hook");

  return after({
    path: call.path,
    method: call.method ?? "POST",
    body: call.body,
    params: call.params,
    headers: call.headers ?? new Headers(),
    context: {
      session: call.session ?? null,
      newSession: call.newSession ?? null,
      returned: call.returned ?? {},
    },
  } as never);
}

function runBefore(call: HookCall) {
  const before = auth.options.hooks?.before;
  if (!before) throw new Error("auth has no before hook");

  return before({
    path: call.path,
    method: call.method ?? "POST",
    body: call.body,
    params: call.params,
    context: {},
  } as never);
}

const eventTypes = () => enqueuedEvents(outbox).map((event) => event.eventType);
const firstEvent = () => enqueuedEvents(outbox)[0];

beforeEach(() => {
  outbox.enqueue.mockClear();
  totp.consume.mockClear();
  reconcile.mockClear();
  findLatestLinkedAccount.mockReset();
  findLatestLinkedAccount.mockResolvedValue(undefined);
  findMemberOf.mockReset();
  findMemberOf.mockResolvedValue({ id: "member-9", role: "member", createdAt: new Date() });
  findActiveMemberOrgId.mockReset();
  findActiveMemberOrgId.mockResolvedValue("org-1");
  insertPersonalOrgWithOwner.mockClear();
});

describe("auth after hook, session-bound paths", () => {
  it.each([
    ["/two-factor/enable", EventTypes.USER_MFA_ENABLED],
    ["/two-factor/disable", EventTypes.USER_MFA_DISABLED],
    ["/two-factor/generate-backup-codes", EventTypes.USER_MFA_BACKUP_CODES_REGENERATED],
    ["/change-password", EventTypes.USER_PASSWORD_CHANGED],
  ])("given %s under a session, then it emits %s for the user", async (path, eventType) => {
    await runAfter({ path, session: SESSION });

    expect(firstEvent()).toMatchObject({ eventType, payload: { userId: "user-1" } });
  });

  it("given a backup code that signed the user in, then it emits user.mfa.backup_code_used", async () => {
    await runAfter({ path: "/two-factor/verify-backup-code", newSession: SESSION });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.USER_MFA_BACKUP_CODE_USED,
      payload: { userId: "user-1", email: "user@example.com" },
    });
  });

  it("given a passkey registration, then it emits the stored passkey id", async () => {
    await runAfter({ path: "/passkey/verify-registration", session: SESSION });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.USER_PASSKEY_ADDED,
      payload: { userId: "user-1", passkeyId: "passkey-1" },
    });
  });

  it("given a passkey deletion, then it emits the id from the body", async () => {
    await runAfter({ path: "/passkey/delete-passkey", session: SESSION, body: { id: "pk-7" } });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.USER_PASSKEY_REMOVED,
      payload: { passkeyId: "pk-7" },
    });
  });

  it("given a profile update, then it emits the changed name", async () => {
    await runAfter({ path: "/update-user", session: SESSION, body: { name: "Ada" } });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.USER_PROFILE_UPDATED,
      payload: { changes: { name: "Ada" } },
    });
  });

  it("given a social account linked seconds ago, then it emits user.account.linked", async () => {
    findLatestLinkedAccount.mockResolvedValue({
      id: "account-1",
      providerId: "github",
      accountId: "gh-1",
      createdAt: new Date(),
    });

    await runAfter({ path: "/link-social", session: SESSION });

    expect(eventTypes()).toEqual([EventTypes.USER_ACCOUNT_LINKED]);
  });

  it.each([
    ["a credential account", "credential", 0],
    ["an account linked long ago", "github", 60_000],
  ])("given %s, then /link-social emits nothing", async (_label, providerId, age) => {
    findLatestLinkedAccount.mockResolvedValue({
      id: "account-1",
      providerId,
      accountId: "a-1",
      createdAt: new Date(Date.now() - age),
    });

    await runAfter({ path: "/link-social", session: SESSION });

    expect(eventTypes()).toEqual([]);
  });

  it("given no session and no matching path, then it emits nothing", async () => {
    await runAfter({ path: "/two-factor/enable" });

    expect(eventTypes()).toEqual([]);
  });
});

describe("auth after hook, sign-in side effects", () => {
  it("given a TOTP verification that signed the user in, then the code is consumed", async () => {
    await runAfter({
      path: "/two-factor/verify-totp",
      newSession: SESSION,
      body: { code: "123456" },
    });

    expect(totp.consume).toHaveBeenCalledWith("user-1", "123456");
  });

  it("given a login carrying the consent cookie, then the consent is reconciled to the user", async () => {
    await runAfter({
      path: "/sign-in/email",
      newSession: SESSION,
      headers: new Headers({ cookie: `${CONSENT_COOKIE_NAME}=abc` }),
    });

    expect(reconcile).toHaveBeenCalledWith("abc", "user-1");
  });
});

describe("auth after hook, SSO", () => {
  it("given a provider registration, then it emits sso.provider.registered", async () => {
    await runAfter({
      path: SSO_PATHS.register,
      session: SESSION,
      returned: {
        providerId: "acme",
        organizationId: "org-1",
        domain: "acme.test",
        issuer: "https://idp.acme.test",
      },
    });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.SSO_PROVIDER_REGISTERED,
      payload: { actorUserId: "user-1", protocol: "oidc" },
    });
  });

  it("given a provider update, then it emits the changed fields without the provider id", async () => {
    await runAfter({
      path: SSO_PATHS.updateProvider,
      session: SESSION,
      body: { providerId: "acme", domain: "acme.test" },
      returned: { providerId: "acme", organizationId: "org-1" },
    });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.SSO_PROVIDER_UPDATED,
      payload: { changedFields: ["domain"] },
    });
  });

  it("given a domain verification, then it emits sso.domain.verified", async () => {
    await runAfter({
      path: SSO_PATHS.verifyDomain,
      session: SESSION,
      body: { providerId: "acme" },
    });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.SSO_DOMAIN_VERIFIED,
      payload: { domain: "acme.test" },
    });
  });

  it.each([
    [SSO_PATHS.callbackWithProvider, "oidc"],
    [SSO_PATHS.samlAcs, "saml"],
  ])("given a successful callback on %s, then it emits a %s login", async (path, protocol) => {
    await runAfter({ path, newSession: SESSION, params: { providerId: "acme" } });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.SSO_LOGIN_SUCCESS,
      payload: { userId: "user-1", providerId: "acme", protocol },
    });
  });

  it("given a refused callback, then it emits sso.login.failure with the provider org", async () => {
    await runAfter({
      path: SSO_PATHS.callbackWithProvider,
      params: { providerId: "acme" },
      returned: new APIError("UNAUTHORIZED", { message: "invalid state" }),
    });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.SSO_LOGIN_FAILURE,
      payload: { providerId: "acme", reason: "invalid state" },
    });
  });

  it("given a provider deletion, when the before hook took its snapshot, then the after hook emits sso.provider.deleted", async () => {
    await runBefore({ path: SSO_PATHS.deleteProvider, body: { providerId: "acme" } });
    await runAfter({
      path: SSO_PATHS.deleteProvider,
      session: SESSION,
      body: { providerId: "acme" },
    });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.SSO_PROVIDER_DELETED,
      payload: { organizationId: "org-1", providerId: "acme" },
    });
  });
});

describe("auth after hook, SCIM", () => {
  it("given a provisioned user, then it emits scim.user.created then org.member.joined", async () => {
    await runAfter({ path: SCIM_PATHS.users, method: "POST", returned: { id: "scim-1" } });

    expect(eventTypes()).toEqual([EventTypes.SCIM_USER_CREATED, EventTypes.ORG_MEMBER_JOINED]);
    expect(firstEvent()?.payload).toMatchObject({ userId: "user-9", actorUserId: "owner-1" });
  });

  it("given a deletion, when the before hook took its snapshot, then the after hook emits scim.user.deprovisioned", async () => {
    await runBefore({ path: SCIM_PATHS.user, method: "DELETE", params: { userId: "scim-1" } });
    findMemberOf.mockResolvedValue(undefined);
    await runAfter({ path: SCIM_PATHS.user, method: "DELETE", params: { userId: "scim-1" } });

    expect(eventTypes()).toEqual([
      EventTypes.SCIM_USER_DEPROVISIONED,
      EventTypes.ORG_MEMBER_REMOVED,
    ]);
  });
});

describe("auth database hooks", () => {
  const hooks = auth.options.databaseHooks;

  it("given a social account deleted, then it emits user.account.unlinked", async () => {
    await hooks?.account?.delete?.after?.({
      id: "account-1",
      userId: "user-1",
      providerId: "github",
      accountId: "gh-1",
    } as never);

    expect(eventTypes()).toEqual([EventTypes.USER_ACCOUNT_UNLINKED]);
  });

  it("given the credential account deleted, then it emits nothing", async () => {
    await hooks?.account?.delete?.after?.({
      id: "account-1",
      userId: "user-1",
      providerId: "credential",
      accountId: "c-1",
    } as never);

    expect(eventTypes()).toEqual([]);
  });

  it("given a session created, then it emits user.signed_in", async () => {
    await hooks?.session?.create?.after?.({
      id: "session-1",
      userId: "user-1",
      ipAddress: null,
      userAgent: null,
    } as never);

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.USER_SIGNED_IN,
      payload: { userId: "user-1", sessionId: "session-1" },
    });
  });

  it("given a signup whose user already has an org, then it emits user.created once and creates no org", async () => {
    await hooks?.user?.create?.after?.({
      id: "user-1",
      email: "user@example.com",
      name: "Ada",
    } as never);

    expect(eventTypes()).toEqual([EventTypes.USER_CREATED]);
    expect(insertPersonalOrgWithOwner).not.toHaveBeenCalled();
  });
});

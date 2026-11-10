import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IDisposableEmailService } from "../shared/ports/disposable-email.port";
import type { IPasswordBreachService } from "../shared/ports/password-breach.port";

const outbox = mockPort<IOutboxRepository>();
const breach = mockPort<IPasswordBreachService>();
const disposable = mockPort<IDisposableEmailService>();
const { unitOfWork } = mockUnitOfWork();
let entitledFeatures: string[] = [];

mock.module("../container", () => ({
  di: {
    BillingCatalogService: { getCatalog: async () => [] },
    IOutboxRepository: outbox,
    ITransactionService: unitOfWork,
    IPasswordBreachService: breach,
    IDisposableEmailService: disposable,
    SecuritySignalsService: { refuseDenied: async () => Result.ok() },
    EntitlementsService: { getEntitlements: async () => ({ features: entitledFeatures }) },
  },
}));

const clearExpiredBan = mock(async () => false);

const realAuthQueries = await import("../auth/queries");
mock.module("../auth/queries", () => ({
  ...realAuthQueries,
  clearExpiredBan,
  enforcedProviderForDomain: async () => Option.none(),
}));

const { auth } = await import("../auth");
const { IMPERSONATION_BLOCKED_PATHS } = await import(
  "../shared/middleware/impersonation-blocklist"
);
const { SSO_PATHS } = await import("../shared/auth/sso-paths");

const getSession = spyOn(auth.api, "getSession");
const HEADERS = new Headers({ cookie: "session=abc" });

function signedIn(impersonatedBy: string | null) {
  return {
    session: { impersonatedBy },
    user: { id: "user-1", email: "user@example.com", name: "Ada" },
  };
}

function runBefore(path: string, body?: Record<string, unknown>, headers?: Headers) {
  const before = auth.options.hooks?.before;
  if (!before) throw new Error("auth has no before hook");

  return before({ path, method: "POST", body, headers, context: {} } as never);
}

const eventTypes = () => enqueuedEvents(outbox).map((event) => event.eventType);

beforeEach(() => {
  outbox.enqueue.mockClear();
  getSession.mockReset();
  breach.isBreached.mockReset();
  breach.isBreached.mockResolvedValue(Result.ok(false));
  disposable.isDisposable.mockReset();
  disposable.isDisposable.mockResolvedValue(Result.ok(false));
  clearExpiredBan.mockReset();
  clearExpiredBan.mockResolvedValue(false);
  entitledFeatures = [];
});

describe("auth plugin order", () => {
  it("keeps every plugin at its position, the expired-ban clearing before the admin plugin", () => {
    expect(auth.options.plugins.map((plugin) => plugin.id)).toEqual([
      "stripe",
      "bearer",
      "two-factor",
      "security-signals",
      "magic-link",
      "passkey",
      "clear-expired-ban",
      "admin",
      "organization",
      "sso",
      "scim",
      "custom-session",
    ]);
  });
});

describe("clear-expired-ban plugin", () => {
  const plugin = auth.options.plugins.find((candidate) => candidate.id === "clear-expired-ban");

  async function createSession() {
    const initialised = await plugin?.init?.();
    const before = initialised?.options?.databaseHooks?.session?.create?.before;
    if (!before) throw new Error("clear-expired-ban exposes no session create hook");

    return before({ userId: "user-1" });
  }

  it("given an expired ban, when a session is created, then the unban is announced", async () => {
    clearExpiredBan.mockResolvedValue(true);

    await createSession();

    expect(enqueuedEvents(outbox)).toEqual([
      expect.objectContaining({
        eventType: EventTypes.ADMIN_USER_UNBANNED,
        payload: { actorUserId: null, userId: "user-1" },
      }),
    ]);
  });

  it("given no expired ban, when a session is created, then nothing is announced", async () => {
    await createSession();

    expect(eventTypes()).toEqual([]);
  });
});

describe("auth before hook, impersonation", () => {
  const blocked = IMPERSONATION_BLOCKED_PATHS[0] ?? "/change-password";

  it("given an impersonated session, when a blocked path is hit, then it is refused", async () => {
    getSession.mockResolvedValue(signedIn("admin-1") as never);

    await expect(runBefore(blocked, {}, HEADERS)).rejects.toMatchObject({
      message: "IMPERSONATION_ACTION_FORBIDDEN",
    });
  });

  it("given a regular session, when a blocked path is hit, then it is not refused for impersonation", async () => {
    getSession.mockResolvedValue(signedIn(null) as never);

    await expect(runBefore("/update-user", {}, HEADERS)).resolves.toBeUndefined();
    expect(getSession).toHaveBeenCalledWith({ headers: HEADERS });
  });
});

describe("auth before hook, passwords", () => {
  it("given a breached new password, when it is changed, then the breach names the session user as actor", async () => {
    getSession.mockResolvedValue(signedIn(null) as never);
    breach.isBreached.mockResolvedValue(Result.ok(true));

    await expect(
      runBefore("/change-password", { newPassword: "correct horse battery staple" }, HEADERS),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(enqueuedEvents(outbox)).toEqual([
      expect.objectContaining({
        eventType: EventTypes.SECURITY_PASSWORD_BREACHED,
        payload: expect.objectContaining({ actorUserId: "user-1", email: "user@example.com" }),
      }),
    ]);
  });

  it("given a sign-up password containing the email, then it is refused as unprocessable", async () => {
    await expect(
      runBefore("/sign-up/email", {
        email: "ada.lovelace@example.com",
        name: "Ada",
        password: "my-ada.lovelace-passphrase",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe("auth before hook, SSO registration gate", () => {
  it("given no organization, when a provider is registered, then it is refused", async () => {
    await expect(runBefore(SSO_PATHS.register, {})).rejects.toMatchObject({
      message: "SSO_ORGANIZATION_REQUIRED",
    });
  });

  it("given an organization without the sso feature, when a provider is registered, then it is refused", async () => {
    await expect(runBefore(SSO_PATHS.register, { organizationId: "org-1" })).rejects.toMatchObject({
      message: "SSO_PLAN_REQUIRED",
    });
  });

  it("given an organization with the sso feature, when a provider is registered, then its domain is lowercased", async () => {
    entitledFeatures = ["sso"];
    const body = { organizationId: "org-1", domain: "ACME.test" };

    await runBefore(SSO_PATHS.register, body);

    expect(body.domain).toBe("acme.test");
  });
});

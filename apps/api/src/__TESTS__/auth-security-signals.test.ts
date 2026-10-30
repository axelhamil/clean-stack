import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { IMPERSONATE_PATH } from "../shared/middleware/impersonation-blocklist";
import type { GeoDeniedError } from "../shared/services/security-signals.service";

const refuseDenied = mock(async (): Promise<Result<void, GeoDeniedError>> => Result.ok());
const reportImpossibleTravel = mock(async () => undefined);
const sessionFields = mock((): { country?: string } => ({}));
const enqueue = mock(async () => undefined);

mock.module("../container", () => ({
  di: {
    BillingCatalogService: { getCatalog: async () => [] },
    IOutboxRepository: { enqueue },
    SecuritySignalsService: { refuseDenied, reportImpossibleTravel, sessionFields },
  },
}));

const realAuthQueries = await import("../auth-queries");
mock.module("../auth-queries", () => ({
  ...realAuthQueries,
  emailFor: async () => undefined,
}));

const { auth } = await import("../auth");

const sessionHooks = auth.options.databaseHooks?.session?.create;
const session = {
  id: "session-1",
  userId: "user-1",
  activeOrganizationId: "org-1",
  ipAddress: null,
};
const DENIED: GeoDeniedError = { code: "SECURITY_GEO_FORBIDDEN", message: "Not from there." };

const OWN_SESSION = { user: { id: session.userId } };
const OTHER_SESSION = { user: { id: "user-2" } };

const runBefore = (path: string, carried: { user: { id: string } } | null = null) =>
  sessionHooks?.before?.(session as never, { path, context: { session: carried } } as never);

const travelHook = auth.options.plugins.find((plugin) => plugin.id === "security-signals")?.hooks
  ?.after?.[0]?.handler;
const runTravelHook = (
  path: string,
  context: { newSession: unknown; session?: unknown; returned?: unknown },
) => travelHook?.({ path, context: { session: null, ...context } } as never);
const NEW_SESSION = {
  session: { id: "session-2", ipAddress: "203.0.113.9" },
  user: { id: "user-1" },
};

describe("auth hooks, security signals", () => {
  beforeEach(() => {
    refuseDenied.mockReset();
    refuseDenied.mockResolvedValue(Result.ok());
    reportImpossibleTravel.mockClear();
    sessionFields.mockReset();
    sessionFields.mockReturnValue({});
  });

  it("given a denied visitor, when an email path is hit, then the hook refuses with the stable code", async () => {
    refuseDenied.mockResolvedValue(Result.fail(DENIED));

    const hook = auth.options.hooks?.before?.({
      path: "/sign-up/email",
      method: "POST",
      headers: new Headers(),
      body: { email: "a@example.com" },
      context: {},
    } as never);

    await expect(hook).rejects.toMatchObject({
      body: { code: DENIED.code, message: DENIED.message },
    });
    expect(refuseDenied.mock.calls[0]).toEqual([
      expect.objectContaining({ path: "/sign-up/email", actorUserId: null }),
    ] as never);
  });

  it("given a denied visitor, when a session is minted by any sign-in flow, then it is refused with the user as actor", async () => {
    refuseDenied.mockResolvedValue(Result.fail(DENIED));

    await expect(runBefore("/passkey/verify-authentication")).rejects.toMatchObject({
      body: { code: DENIED.code },
    });
    expect(refuseDenied.mock.calls[0]).toEqual([
      expect.objectContaining({ actorUserId: "user-1" }),
    ] as never);
  });

  it("given an impersonation, when the session is minted for the target, then neither signal runs", async () => {
    await runBefore(IMPERSONATE_PATH, OTHER_SESSION);
    await runTravelHook(IMPERSONATE_PATH, { newSession: NEW_SESSION, session: OTHER_SESSION });

    expect(refuseDenied).not.toHaveBeenCalled();
    expect(reportImpossibleTravel).not.toHaveBeenCalled();
  });

  it.each([
    "/change-password",
    "/update-user",
    "/two-factor/enable",
    "/two-factor/disable",
    "/two-factor/verify-totp",
    "/two-factor/verify-otp",
    "/verify-email",
  ])(
    "given %s under the user's own session, when it is renewed, then neither signal runs",
    async (path) => {
      refuseDenied.mockResolvedValue(Result.fail(DENIED));

      await runBefore(path, OWN_SESSION);
      await runTravelHook(path, { newSession: NEW_SESSION, session: OWN_SESSION });

      expect(refuseDenied).not.toHaveBeenCalled();
      expect(reportImpossibleTravel).not.toHaveBeenCalled();
    },
  );

  it.each(["/two-factor/verify-totp", "/two-factor/verify-otp", "/verify-email"])(
    "given %s with no session, when the session is minted, then a denied visitor is refused",
    async (path) => {
      refuseDenied.mockResolvedValue(Result.fail(DENIED));

      await expect(runBefore(path)).rejects.toMatchObject({ body: { code: DENIED.code } });
    },
  );

  it("given a session of another user, when a sign-in mints one, then a denied visitor is refused", async () => {
    refuseDenied.mockResolvedValue(Result.fail(DENIED));

    await expect(runBefore("/passkey/verify-authentication", OTHER_SESSION)).rejects.toMatchObject({
      body: { code: DENIED.code },
    });
  });

  it("given a sign-in, when the session is created, then the country is stored", async () => {
    sessionFields.mockReturnValue({ country: "JP" });

    expect(await runBefore("/sign-in/email")).toMatchObject({ data: { country: "JP" } });
  });

  it("given a completed sign-in, then the travel signal runs once on that session", async () => {
    await runTravelHook("/two-factor/verify-totp", { newSession: NEW_SESSION });

    expect(reportImpossibleTravel.mock.calls).toEqual([
      [expect.objectContaining({ userId: "user-1", sessionId: "session-2", ip: "203.0.113.9" })],
    ] as never);
  });

  it("given a 2FA challenge, when no session stands, then the travel signal stays silent", async () => {
    await runTravelHook("/sign-in/email", { newSession: null });

    expect(reportImpossibleTravel).not.toHaveBeenCalled();
  });

  it.each([
    "/sso/callback/:providerId",
    "/sso/callback",
    "/sso/saml2/sp/acs/:providerId",
    "/callback/:id",
  ])(
    "given a denied visitor, when %s is hit, then it is refused before the handler opens its transaction",
    async (path) => {
      refuseDenied.mockResolvedValue(Result.fail(DENIED));

      const hook = auth.options.hooks?.before?.({
        path,
        method: "GET",
        headers: new Headers(),
        context: {},
      } as never);

      await expect(hook).rejects.toMatchObject({ body: { code: DENIED.code } });
    },
  );

  it("given a denied visitor, when a first sign-up creates the user, then the row is refused", async () => {
    refuseDenied.mockResolvedValue(Result.fail(DENIED));

    const create = auth.options.databaseHooks?.user?.create?.before?.(
      {} as never,
      { path: "/magic-link/verify" } as never,
    );

    await expect(create).rejects.toMatchObject({ body: { code: DENIED.code } });
  });

  it.each(["/admin/create-user", "/scim/v2/Users"])(
    "given %s, when a user is provisioned for someone else, then the operator's location does not matter",
    async (path) => {
      refuseDenied.mockResolvedValue(Result.fail(DENIED));

      await auth.options.databaseHooks?.user?.create?.before?.({} as never, { path } as never);

      expect(refuseDenied).not.toHaveBeenCalled();
    },
  );

  it("given every flag off, when a session is created, then its data gains no field", async () => {
    const before = await runBefore("/sign-in/email");

    expect<unknown>(before).toEqual({ data: { ...session, ipAddress: null } });
  });
});

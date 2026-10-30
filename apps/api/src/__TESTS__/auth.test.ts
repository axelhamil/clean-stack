import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { runWithRequestContext } from "../shared/request-context";

const accept = mock(async (_userId: string, _types: string[], _ip?: string) => Result.ok());
const getStaleTypes = mock(async () => Result.ok(["terms"]));
const enqueue = mock(async (_events: { eventType: string; payload: unknown }[]) => undefined);

let memberRole: string | null = null;

mock.module("../container", () => ({
  di: {
    BillingCatalogService: { getCatalog: async () => [] },
    IOutboxRepository: { enqueue },
    PolicyAcceptanceService: { accept, getStaleTypes },
  },
}));

const realAuthQueries = await import("../auth-queries");
mock.module("../auth-queries", () => ({
  ...realAuthQueries,
  findActiveMemberRole: async () => memberRole,
}));

const { auth } = await import("../auth");

const RESOLVED_IP = "198.51.100.7";
const SPOOFED_IP = "203.0.113.66";

const signedIn = {
  user: { id: "user-1", email: "user@example.com", emailVerified: true },
  session: { id: "session-1", ipAddress: SPOOFED_IP },
};

function verifyEmailHook(context: { session: unknown; newSession: unknown }) {
  const after = auth.options.hooks?.after;
  if (!after) throw new Error("auth has no after hook");

  return after({
    path: "/verify-email",
    method: "GET",
    headers: new Headers({ "x-forwarded-for": SPOOFED_IP }),
    context: { ...context, returned: {} },
  } as never);
}

function emailVerifiedEvents() {
  return enqueue.mock.calls
    .flatMap(([events]) => events)
    .filter((event) => event.eventType === EventTypes.USER_EMAIL_VERIFIED);
}

describe("auth after hook, /verify-email", () => {
  beforeEach(() => {
    accept.mockClear();
    enqueue.mockClear();
  });

  it("emits user.email_verified from the new session when the request had no session", async () => {
    await verifyEmailHook({ session: null, newSession: signedIn });

    expect(emailVerifiedEvents()[0]?.payload).toEqual({
      userId: "user-1",
      email: "user@example.com",
    });
  });

  it("emits nothing when the call verified nothing", async () => {
    await verifyEmailHook({ session: signedIn, newSession: null });

    expect(emailVerifiedEvents()).toHaveLength(0);
  });

  it("does not accept stale terms for a signed-in user confirming an email change", async () => {
    await verifyEmailHook({ session: signedIn, newSession: signedIn });

    expect(accept).not.toHaveBeenCalled();
  });
});

describe("first email verification", () => {
  beforeEach(() => {
    accept.mockClear();
  });

  it("records the policy acceptance with the trusted-proxy ip, not the client X-Forwarded-For", async () => {
    const before = auth.options.emailVerification?.beforeEmailVerification;
    if (!before) throw new Error("auth has no beforeEmailVerification");

    await runWithRequestContext({ requestId: "req-1", clientIp: () => RESOLVED_IP }, () =>
      before(signedIn.user as never),
    );

    expect(accept).toHaveBeenCalledWith("user-1", ["terms"], RESOLVED_IP);
  });
});

describe("stripe authorizeReference", () => {
  const plugin = auth.options.plugins.find((candidate) => candidate.id === "stripe");
  const authorizeReference = plugin?.options?.subscription?.authorizeReference;

  function authorize(action: string, referenceId = "org-1") {
    if (!authorizeReference) throw new Error("stripe plugin has no authorizeReference");

    return authorizeReference({
      user: { id: "user-1" },
      session: {},
      referenceId,
      action,
    } as never);
  }

  beforeEach(() => {
    memberRole = null;
  });

  it("refuses a stranger listing the subscriptions of an organization", async () => {
    expect(await authorize("list-subscription")).toBe(false);
  });

  it("refuses a stranger opening the billing portal of an organization", async () => {
    expect(await authorize("billing-portal")).toBe(false);
  });

  it("lets any member list the subscriptions", async () => {
    memberRole = "member";
    expect(await authorize("list-subscription")).toBe(true);
  });

  it("refuses a plain member the billing portal", async () => {
    memberRole = "member";
    expect(await authorize("billing-portal")).toBe(false);
  });

  it("lets the owner open the billing portal", async () => {
    memberRole = "owner";
    expect(await authorize("billing-portal")).toBe(true);
  });

  it("lets a user act on their own reference", async () => {
    expect(await authorize("billing-portal", "user-1")).toBe(true);
  });

  it("denies an action it does not know, whatever the role", async () => {
    memberRole = "owner";
    expect(await authorize("future-action")).toBe(false);
  });
});

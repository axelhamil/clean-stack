import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { runWithRequestContext } from "../shared/request-context";

const accept = mock(async (_userId: string, _types: string[], _ip?: string) => Result.ok());

mock.module("../container", () => ({
  di: {
    BillingCatalogService: { getCatalog: async () => [] },
    IOutboxRepository: { enqueue: mock(async () => undefined) },
    PolicyAcceptanceService: {
      accept,
      getStaleTypes: mock(async () => Result.ok(["terms"])),
    },
  },
}));

const { auth } = await import("../auth");

const RESOLVED_IP = "198.51.100.7";
const SPOOFED_IP = "203.0.113.66";

function verifyEmail() {
  const session = {
    user: { id: "user-1", email: "user@example.com" },
    session: { id: "session-1", ipAddress: SPOOFED_IP },
  };
  const after = auth.options.hooks?.after;
  if (!after) throw new Error("auth has no after hook");

  return after({
    path: "/verify-email",
    method: "GET",
    headers: new Headers({ "x-forwarded-for": SPOOFED_IP }),
    context: { session, newSession: session, returned: {} },
  } as never);
}

describe("auth after hook, /verify-email", () => {
  beforeEach(() => {
    accept.mockClear();
  });

  it("records the policy acceptance with the trusted-proxy ip, not the client X-Forwarded-For", async () => {
    await runWithRequestContext({ requestId: "req-1", clientIp: () => RESOLVED_IP }, verifyEmail);

    expect(accept).toHaveBeenCalledWith("user-1", ["terms"], RESOLVED_IP);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const REJECTION = { status: 400, code: "DOMAIN_VERIFIED", message: "DOMAIN_VERIFIED" };

vi.mock("../../../shared/auth/auth-client", () => ({
  authClient: {
    sso: {
      register: vi.fn(),
      verifyDomain: vi.fn(),
      providers: vi.fn(),
      requestDomainVerification: vi.fn(),
    },
    scim: { generateToken: vi.fn() },
  },
}));

import { authClient } from "../../../shared/auth/auth-client";
import { isUnexpectedMutationError } from "../../../shared/observability/error-classifier";
import {
  generateScimTokenMutationOptions,
  registerOidcProviderMutationOptions,
  verifyDomainMutationOptions,
} from "../api/sso.mutations";
import { domainVerificationTokenQueryOptions, ssoProvidersQueryOptions } from "../api/sso.queries";

type Rejecting = ReturnType<typeof vi.fn>;

function rejectEveryAuthClientCall() {
  const { sso, scim } = authClient as unknown as {
    sso: Record<string, Rejecting>;
    scim: Record<string, Rejecting>;
  };

  for (const fn of [...Object.values(sso), ...Object.values(scim)]) {
    fn.mockResolvedValue({ data: null, error: REJECTION });
  }
}

async function rejectionOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }

  throw new Error("expected the call to reject");
}

// A BetterAuth rejection carries its HTTP status; dropping it turns every 4xx
// (an already verified domain, a missing plan) into an "unexpected" failure the
// global MutationCache/QueryCache handlers report to telemetry.
describe("sso auth-client failures keep their status and code", () => {
  beforeEach(rejectEveryAuthClientCall);

  const calls: [string, () => Promise<unknown>][] = [
    [
      "register OIDC provider",
      () =>
        registerOidcProviderMutationOptions.mutationFn?.(
          {
            organizationId: "org-1",
            values: {
              domain: "acme.com",
              issuer: "https://idp.acme.com",
              clientId: "id",
              clientSecret: "secret",
            },
          },
          {} as never,
        ) ?? Promise.resolve(),
    ],
    [
      "verify domain",
      () => verifyDomainMutationOptions.mutationFn?.("acme-com", {} as never) ?? Promise.resolve(),
    ],
    [
      "generate SCIM token",
      () =>
        generateScimTokenMutationOptions.mutationFn?.(
          { providerId: "acme-com", organizationId: "org-1" },
          {} as never,
        ) ?? Promise.resolve(),
    ],
    ["list providers", () => (ssoProvidersQueryOptions.queryFn as () => Promise<unknown>)()],
    [
      "load verification token",
      () => (domainVerificationTokenQueryOptions("acme-com").queryFn as () => Promise<unknown>)(),
    ],
  ];

  it.each(calls)("%s", async (_label, run) => {
    const error = await rejectionOf(run);

    expect(error).toMatchObject({
      status: 400,
      code: "DOMAIN_VERIFIED",
      message: "DOMAIN_VERIFIED",
    });
    expect(isUnexpectedMutationError(error)).toBe(false);
  });
});

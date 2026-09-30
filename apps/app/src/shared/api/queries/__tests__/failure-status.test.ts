import { describe, expect, it, vi } from "vitest";

const preflight = vi.fn();
const listUserPasskeys = vi.fn();
const listSessions = vi.fn();

vi.mock("../../api-client", () => ({
  api: { me: { delete: { preflight: { $get: () => preflight() } } } },
}));

vi.mock("../../../auth/auth-client", () => ({
  authClient: {
    passkey: { listUserPasskeys: () => listUserPasskeys() },
    listSessions: () => listSessions(),
  },
}));

import { isUnexpectedError } from "../../../observability/error-classifier";
import { preflightDeletionQueryOptions } from "../account-deletion";
import { passkeysQueryOptions } from "../passkeys";
import { sessionsQueryOptions } from "../sessions";

async function rejectionOf(queryFn: unknown): Promise<unknown> {
  return (queryFn as () => Promise<unknown>)().catch((e: unknown) => e);
}

// Each of these used to throw a bare `new Error(message)`, dropping the status:
// the classifier then read an expected 4xx as unexpected and reported it, and
// the catalog could not resolve the error code into localised copy.
describe("query failures keep the status and the code", () => {
  it("account deletion preflight", async () => {
    preflight.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "ACCOUNT_NOT_FOUND", message: "gone" } }), {
        status: 404,
      }),
    );

    const err = await rejectionOf(preflightDeletionQueryOptions.queryFn);

    expect(err).toMatchObject({ status: 404, code: "ACCOUNT_NOT_FOUND" });
    expect(isUnexpectedError(err)).toBe(false);
  });

  it("passkeys list", async () => {
    listUserPasskeys.mockResolvedValue({
      data: null,
      error: { code: "UNAUTHORIZED", status: 401, message: "no session" },
    });

    const err = await rejectionOf(passkeysQueryOptions.queryFn);

    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ status: 401, code: "UNAUTHORIZED", message: "no session" });
    expect(isUnexpectedError(err)).toBe(false);
  });

  it("sessions list", async () => {
    listSessions.mockResolvedValue({ data: null, error: { status: 401 } });

    const err = await rejectionOf(sessionsQueryOptions.queryFn);

    expect(err).toMatchObject({ status: 401, message: "Failed to load sessions" });
    expect(isUnexpectedError(err)).toBe(false);
  });
});

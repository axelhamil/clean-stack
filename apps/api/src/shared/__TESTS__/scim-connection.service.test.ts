import { describe, expect, it, mock } from "bun:test";
import type { ITransaction } from "../transaction";
import { noopOutbox, passthroughUow } from "./outbox-fakes";

const expiresAt = new Date("2027-01-01T00:00:00Z");

// The service drives the plugin through the BetterAuth singleton, which has no seam.
mock.module("../../auth", () => ({
  auth: {
    api: {
      listSCIMManagedConnections: async () => ({ connections: [] }),
      createSCIMManagedConnection: async () => ({
        token: "scim-token",
        connection: { connectionId: "conn-1" },
        credential: { expiresAt },
      }),
    },
  },
}));

const { ScimConnectionService } = await import("../services/scim-connection.service");
const { NoOpInstrumentation } = await import("../services/noop-instrumentation");

/** A transaction whose savepoints just run their callback, and whose lock is a no-op. */
const tx = {
  execute: async () => undefined,
  transaction: async (callback: (savepoint: unknown) => Promise<unknown>) => callback(tx),
} as unknown as ITransaction;

describe("ScimConnectionService.issueToken", () => {
  it("still returns the token when its event cannot be recorded, and reports the failure", async () => {
    const failure = new Error("outbox unavailable");
    const capture = mock((_err: unknown) => {});
    const instrumentation = Object.assign(new NoOpInstrumentation(), { capture });
    const outbox = {
      ...noopOutbox,
      enqueue: async () => {
        throw failure;
      },
    };

    const result = await new ScimConnectionService(
      outbox,
      passthroughUow(tx),
      instrumentation,
    ).issueToken({
      organizationId: "org-1",
      actorUserId: "owner-1",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual({ token: "scim-token", expiresAt });
    expect(capture).toHaveBeenCalledWith(failure);
  });
});

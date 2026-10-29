import { describe, expect, it, mock } from "bun:test";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IOutboxRepository } from "../ports/outbox.port";

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

const executor = { execute: async () => undefined };
const realDrizzle = await import("@packages/drizzle");
mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  resolveExecutor: () => executor,
  savepoint: <T>(work: () => Promise<T>) => work(),
}));

const { ScimConnectionService } = await import("../services/scim-connection.service");
const { NoOpInstrumentation } = await import("../services/noop-instrumentation");

describe("ScimConnectionService.issueToken", () => {
  it("still returns the token when its event cannot be recorded, and reports the failure", async () => {
    const failure = new Error("outbox unavailable");
    const capture = mock((_err: unknown) => {});
    const instrumentation = Object.assign(new NoOpInstrumentation(), { capture });
    const outbox = mockPort<IOutboxRepository>();
    outbox.enqueue.mockRejectedValue(failure);

    const result = await new ScimConnectionService(
      outbox,
      mockUnitOfWork().unitOfWork,
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

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ILogger } from "@packages/ddd-kit";
import * as realDrizzle from "@packages/drizzle";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";

let rows: () => Promise<unknown[]> = async () => [];
const calls: Array<{ method: string; args: unknown[] }> = [];

function chain(): Record<string, unknown> {
  const node: Record<string, unknown> = {
    toSQL: () => ({ sql: "query", params: [] }),
    execute: () => rows(),
  };
  for (const method of [
    "select",
    "insert",
    "update",
    "delete",
    "from",
    "where",
    "set",
    "values",
    "returning",
    "limit",
  ]) {
    node[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain();
    };
  }
  return node;
}

mock.module("@packages/drizzle", () => ({ ...realDrizzle, resolveExecutor: () => chain() }));

const { DrizzleWebhookEndpointRepository } = await import(
  "../../../infra/repos/drizzle/webhook-endpoint.repository"
);

const ROW = {
  id: "ep-1",
  organizationId: "org-1",
  url: "https://example.com/hook",
  secretCipher: "cipher",
  eventTypes: ["user.created"],
  enabled: true,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  previousSecretCipher: null,
  previousSecretExpiresAt: null,
  consecutiveFailures: 0,
  firstFailedAt: null,
  disabledAt: null,
};

function given() {
  const instrumentation = mockInstrumentation();
  const repository = new DrizzleWebhookEndpointRepository(instrumentation, mockPort<ILogger>());

  return { instrumentation, repository };
}

beforeEach(() => {
  rows = async () => [ROW];
  calls.length = 0;
});

describe("webhook endpoint repository", () => {
  it("clears the failure streak when a member re-enables an endpoint", async () => {
    const { repository } = given();

    await repository.update({ id: "ep-1", organizationId: "org-1", enabled: true });

    expect(calls.find((c) => c.method === "set")?.args[0]).toEqual({
      enabled: true,
      consecutiveFailures: 0,
      firstFailedAt: null,
      disabledAt: null,
    });
  });

  it("keeps the failure streak when an endpoint is disabled or only edited", async () => {
    const { repository } = given();

    await repository.update({ id: "ep-1", organizationId: "org-1", enabled: false });
    await repository.update({ id: "ep-1", organizationId: "org-1", url: "https://example.org" });

    expect(calls.filter((c) => c.method === "set").map((c) => c.args[0])).toEqual([
      { enabled: false },
      { url: "https://example.org" },
    ]);
  });

  it("reports no streak when the bumped endpoint is gone", async () => {
    rows = async () => [];
    const { repository } = given();

    const bumped = await repository.bumpFailure("ep-1", "org-1");

    expect(bumped.isSuccess && bumped.getValue().isNone()).toBe(true);
  });

  it("returns the streak the database counted", async () => {
    const firstFailedAt = new Date("2024-01-01");
    rows = async () => [{ consecutiveFailures: 3, firstFailedAt }];
    const { repository } = given();

    const bumped = await repository.bumpFailure("ep-1", "org-1");

    expect(bumped.isSuccess && bumped.getValue().toNull()).toEqual({
      consecutiveFailures: 3,
      firstFailedAt,
    });
  });

  it("returns a failure instead of throwing when the insert yields no row", async () => {
    rows = async () => [];
    const { repository } = given();

    const created = await repository.create({
      id: "ep-1",
      organizationId: "org-1",
      url: "https://example.com/hook",
      secretCipher: "cipher",
      eventTypes: ["user.created"],
      enabled: true,
    });

    expect(created.isFailure && created.getError().code).toBe(
      "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE",
    );
  });

  it("surfaces a database failure to telemetry and returns it instead of throwing", async () => {
    const boom = new Error("connection reset");
    rows = async () => {
      throw boom;
    };
    const { instrumentation, repository } = given();

    const found = await repository.findById("ep-1", "org-1");

    expect(found.isFailure && found.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
    expect(instrumentation.capture).toHaveBeenCalledWith(boom);
  });
});

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ILogger } from "@packages/ddd-kit";
import * as realDrizzle from "@packages/drizzle";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";

let results: unknown[][] = [];

function chain(): Record<string, unknown> {
  const node: Record<string, unknown> = {
    toSQL: () => ({ sql: "query", params: [] }),
    execute: async () => results.shift() ?? [],
  };
  for (const method of ["select", "from", "where", "limit", "innerJoin", "orderBy"]) {
    node[method] = () => chain();
  }
  return node;
}

mock.module("@packages/drizzle", () => ({ ...realDrizzle, resolveExecutor: () => chain() }));

const { DrizzleListDeliveriesQuery } = await import("../../../infra/queries/list-deliveries.query");
const { DrizzleGetDeliveryQuery } = await import("../../../infra/queries/get-delivery.query");

const delivery = (id: string, createdAt: string) => ({
  d: {
    id,
    endpointId: "ep-1",
    outboxEventId: "out-1",
    eventType: "user.created",
    payload: {},
    status: "success",
    attempts: 1,
    nextAttemptAt: null,
    lastError: null,
    lastResponseStatus: 200,
    idempotencyKey: `out-1:${id}`,
    createdAt: new Date(createdAt),
  },
});

const listDeliveries = () =>
  new DrizzleListDeliveriesQuery(mockInstrumentation(), mockPort<ILogger>());
const getDelivery = () => new DrizzleGetDeliveryQuery(mockInstrumentation(), mockPort<ILogger>());

beforeEach(() => {
  results = [];
});

describe("listing the deliveries of an endpoint", () => {
  it("reads as not found when the endpoint is not in the organization", async () => {
    results = [[]];

    const page = await listDeliveries().execute({ endpointId: "ep-1", organizationId: "org-2" });

    expect(page.isFailure && page.getError().code).toBe("WEBHOOK_ENDPOINT_NOT_FOUND");
  });

  it("returns one page and the cursor of its last item when more rows remain", async () => {
    results = [
      [{ id: "ep-1" }],
      [
        delivery("del-3", "2024-01-03"),
        delivery("del-2", "2024-01-02"),
        delivery("del-1", "2024-01-01"),
      ],
    ];

    const page = await listDeliveries().execute({
      endpointId: "ep-1",
      organizationId: "org-1",
      limit: 2,
    });

    expect(page.isSuccess).toBe(true);
    const { items, nextCursor } = page.getValue();
    expect(items.map((d) => d.id)).toEqual(["del-3", "del-2"]);
    expect(nextCursor.toNull()).toBe("2024-01-02T00:00:00.000Z");
  });

  it("returns no cursor on the last page", async () => {
    results = [[{ id: "ep-1" }], [delivery("del-1", "2024-01-01")]];

    const page = await listDeliveries().execute({
      endpointId: "ep-1",
      organizationId: "org-1",
      limit: 2,
    });

    expect(page.isSuccess && page.getValue().nextCursor.isNone()).toBe(true);
  });
});

describe("reading one delivery", () => {
  it("reads as endpoint not found when the endpoint is not in the organization", async () => {
    results = [[]];

    const found = await getDelivery().execute({
      deliveryId: "del-1",
      endpointId: "ep-1",
      organizationId: "org-2",
    });

    expect(found.isFailure && found.getError().code).toBe("WEBHOOK_ENDPOINT_NOT_FOUND");
  });

  it("reads as delivery not found when the delivery belongs to another endpoint", async () => {
    results = [[{ id: "ep-1" }], []];

    const found = await getDelivery().execute({
      deliveryId: "del-other",
      endpointId: "ep-1",
      organizationId: "org-1",
    });

    expect(found.isFailure && found.getError().code).toBe("WEBHOOK_DELIVERY_NOT_FOUND");
  });
});

import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  type IInstrumentation,
  type ILogger,
  Option,
  Result,
  UnitOfWorkContext,
} from "@packages/ddd-kit";
import * as realDrizzle from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import { serve } from "bun";
import type { IUrlGuard } from "../application/ports/url-guard.port";
import type {
  DeliveryFailure,
  IWebhookDeliveryRepository,
  WebhookDeliveryRecord,
} from "../application/ports/webhook-delivery.port";
import type {
  IWebhookEndpointRepository,
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../application/ports/webhook-endpoint.port";
import * as realAead from "../infrastructure/crypto/aead";

// ---------------------------------------------------------------------------
// Drizzle mock: scoped to this file's module registry, invisible to other files.
// ---------------------------------------------------------------------------
type EndpointRow = {
  id: string;
  url: string;
  organizationId: string;
  secretCipher: string;
  enabled: boolean;
  previousSecretCipher: string | null;
  previousSecretExpiresAt: Date | null;
  consecutiveFailures: number;
  firstFailedAt: Date | null;
  disabledAt: Date | null;
};

let dbTransactionResult: EndpointRow[] = [];
let endpointLookupFails = false;

function makeQueryChain(result: () => unknown) {
  const leaf = {
    execute: async () => result(),
    toSQL: () => ({ sql: "SELECT 1", params: [] }),
  };
  const proxy: unknown = new Proxy(leaf, {
    get(target, prop) {
      if (prop === "execute" || prop === "toSQL") return Reflect.get(target, prop);
      return () => proxy;
    },
  });
  return proxy;
}

const fakeDb = {
  select: () => makeQueryChain(() => dbTransactionResult),
  insert: () => makeQueryChain(() => []),
  update: () => makeQueryChain(() => []),
  delete: () => makeQueryChain(() => []),
  execute: async () => {},
};

mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  db: fakeDb,
  resolveExecutor: () => fakeDb,
}));

// ---------------------------------------------------------------------------
// AEAD mock: returns predictable values so HMAC path is exercised
// ---------------------------------------------------------------------------
mock.module("../infrastructure/crypto/aead", () => ({
  ...realAead,
  deriveOrgSubKey: (_key: Uint8Array, _orgId: string) => new Uint8Array(32),
  decryptSecret: (_cipher: string, _key: Uint8Array) => "test-webhook-secret",
  masterKeyFromHex: (_hex: string) => new Uint8Array(32),
  encryptSecret: (_plaintext: string, _key: Uint8Array) => "ciphertext",
}));

const { WebhookDeliveryWorker } = await import(
  "../infrastructure/services/webhook-delivery-worker.service"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const OPTIONS = {
  leaseSeconds: 330,
  deadRetrySeconds: 21_600,
  autoDisableMinFailures: 2,
  autoDisableAfterDays: 5,
  responseCaptureBytes: 4096,
  httpsOnly: false,
};

function makeDelivery(over: Partial<WebhookDeliveryRecord> = {}): WebhookDeliveryRecord {
  return {
    id: "del-1",
    endpointId: "ep-1",
    outboxEventId: "evt-1",
    eventType: "USER_CREATED",
    payload: { userId: "u1" },
    status: "pending",
    attempts: 1,
    nextAttemptAt: Option.none<Date>(),
    lastError: Option.none<string>(),
    lastResponseStatus: Option.none<number>(),
    idempotencyKey: "idem-1",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...over,
  };
}

type BumpFailureResult = ReturnType<IWebhookEndpointRepository["bumpFailure"]>;

function makeFakeEndpoints(opts?: { bumpFailureResult?: BumpFailureResult }) {
  const calls = {
    resetFailure: [] as string[],
    markDisabled: [] as string[],
    bumpFailure: [] as string[],
  };
  return {
    calls,
    applySecretRotation: async () => Result.ok(Option.some({} as never)),
    bumpFailure: async (id: string, _orgId: string) => {
      calls.bumpFailure.push(id);
      return opts?.bumpFailureResult ?? Result.ok(Option.none());
    },
    resetFailure: async (id: string, _orgId: string) => {
      calls.resetFailure.push(id);
      return Result.ok(undefined as never);
    },
    markDisabled: async (id: string, _orgId: string, _date: Date) => {
      calls.markDisabled.push(id);
      return Result.ok(undefined as never);
    },
    create: async () => Result.ok({} as never),
    update: async () => Result.ok(Option.none()),
    delete: async () => Result.ok(false),
    findById: async () => Result.ok(Option.none()),
    findEnabledById: async (
      id: string,
    ): Promise<Result<Option<WebhookEndpointRecord>, WebhookRepoError>> => {
      if (endpointLookupFails) {
        return Result.fail({ code: "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE", message: "db down" });
      }
      const row = dbTransactionResult.find((r) => r.id === id && r.enabled);
      return Result.ok(Option.fromNullable(row).map(toEndpointRecord));
    },
    listByOrg: async () => Result.ok([]),
  };
}

function toEndpointRecord(row: EndpointRow): WebhookEndpointRecord {
  return {
    ...row,
    eventTypes: [],
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    previousSecretCipher: Option.fromNullable(row.previousSecretCipher),
    previousSecretExpiresAt: Option.fromNullable(row.previousSecretExpiresAt),
    firstFailedAt: Option.fromNullable(row.firstFailedAt),
    disabledAt: Option.fromNullable(row.disabledAt),
  };
}

const FAKE_ENDPOINT: EndpointRow = {
  id: "ep-1",
  url: "https://example.com/hook",
  organizationId: "org-1",
  secretCipher: "c2VjcmV0Y2lwaGVydGV4dA==",
  enabled: true,
  previousSecretCipher: null,
  previousSecretExpiresAt: null,
  consecutiveFailures: 0,
  firstFailedAt: null,
  disabledAt: null,
};

let deliveries: PortMock<IWebhookDeliveryRepository>;
let outbox: PortMock<IOutboxRepository>;
let uow: UnitOfWorkMock;
let endpoints: ReturnType<typeof makeFakeEndpoints>;
let logger: PortMock<ILogger>;
let settledIn: unknown[];
let enqueuedIn: unknown[];

type WorkerDeps = {
  masterKey?: () => Option<Uint8Array>;
  instrumentation?: PortMock<IInstrumentation>;
  options?: typeof OPTIONS;
  fetchImpl?: unknown;
  clock?: () => number;
};

const PRIVATE_HOSTS = ["127.0.0.1", "localhost", "0.0.0.0", "::1"];

function makeUrlGuard(): PortMock<IUrlGuard> {
  const guard = mockPort<IUrlGuard>();
  guard.assertPublic.mockImplementation(async (rawUrl: string) => {
    try {
      const url = new URL(rawUrl);
      if (url.hostname === "slow-dns.example.com") {
        return Result.fail({
          code: "WEBHOOK_HOST_LOOKUP_TIMEOUT",
          message: "host lookup timed out",
        });
      }
      const isPrivate =
        PRIVATE_HOSTS.includes(url.hostname) ||
        /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(url.hostname);
      if (isPrivate) {
        return Result.fail({
          code: "WEBHOOK_URL_FORBIDDEN",
          message: "destination not publicly routable",
        });
      }
      return Result.ok(url);
    } catch {
      return Result.fail({ code: "WEBHOOK_URL_FORBIDDEN", message: "invalid url" });
    }
  });

  return guard;
}

function makeWorker(deps: WorkerDeps = {}) {
  return new WebhookDeliveryWorker(
    deliveries,
    endpoints as unknown as IWebhookEndpointRepository,
    deps.masterKey ?? (() => Option.some(new Uint8Array(32))),
    outbox,
    uow.unitOfWork,
    logger,
    deps.instrumentation ?? mockInstrumentation(),
    makeUrlGuard(),
    deps.options ?? OPTIONS,
    deps.fetchImpl as typeof fetch | undefined,
    deps.clock,
  );
}

function claims(batch: WebhookDeliveryRecord[]): void {
  deliveries.claim.mockResolvedValueOnce(Result.ok(batch));
}

async function runDrain(worker: InstanceType<typeof WebhookDeliveryWorker>) {
  await (worker as unknown as { drain: () => Promise<void> }).drain();
}

const respond =
  (status: number, body: string | null = null) =>
  async () =>
    new Response(body, { status });

const failures = (): DeliveryFailure[] => deliveries.markFailed.mock.calls.map(([, f]) => f);
const attempts = () => deliveries.createAttempt.mock.calls.map(([attempt]) => attempt);
const eventTypes = () => enqueuedEvents(outbox).map(({ eventType }) => eventType);

describe("WebhookDeliveryWorker", () => {
  beforeEach(() => {
    dbTransactionResult = [FAKE_ENDPOINT];
    endpointLookupFails = false;
    deliveries = mockPort<IWebhookDeliveryRepository>();
    outbox = mockPort<IOutboxRepository>();
    uow = mockUnitOfWork();
    endpoints = makeFakeEndpoints();
    logger = mockPort<ILogger>();
    settledIn = [];
    enqueuedIn = [];
    deliveries.claim.mockResolvedValue(Result.ok([]));
    deliveries.markSuccess.mockImplementation(async () => {
      settledIn.push(UnitOfWorkContext.transaction());
      return Result.ok(true);
    });
    deliveries.markFailed.mockImplementation(async () => {
      settledIn.push(UnitOfWorkContext.transaction());
      return Result.ok(true);
    });
    deliveries.release.mockResolvedValue(Result.ok(true));
    deliveries.createAttempt.mockResolvedValue(Result.ok());
    outbox.enqueue.mockImplementation(async () => {
      enqueuedIn.push(UnitOfWorkContext.transaction());
    });
  });

  it("start() then stop() shuts down cleanly without a blocking loop", async () => {
    const worker = makeWorker();

    await worker.start();
    await new Promise((r) => setTimeout(r, 20));
    await worker.stop();

    expect(deliveries.claim).toHaveBeenCalled();
  });

  it("reports a failing first drain instead of leaving an unhandled rejection", async () => {
    const instrumentation = mockInstrumentation();
    const captureSpy = instrumentation.capture;
    deliveries.claim.mockRejectedValue(new Error("connection refused"));
    const worker = makeWorker({ instrumentation });

    await worker.start();
    await new Promise((r) => setTimeout(r, 20));
    await worker.stop();

    expect(captureSpy).toHaveBeenCalled();
    expect(logger.error.mock.calls.map(([, message]) => message)).toContain(
      "webhook delivery drain failed",
    );
  });

  it("keeps a delivery retryable when its host lookup times out", async () => {
    dbTransactionResult = [{ ...FAKE_ENDPOINT, url: "https://slow-dns.example.com/hook" }];
    claims([makeDelivery()]);
    let fetched = false;
    const mockFetch = async () => {
      fetched = true;
      return new Response(null, { status: 200 });
    };

    await runDrain(makeWorker({ fetchImpl: mockFetch }));

    expect(fetched).toBe(false);
    expect(failures().map((f) => [f.status, f.lastError])).toEqual([
      ["failed", "host lookup timed out"],
    ]);
    expect(eventTypes()).toEqual([]);
  });

  it("releases the deliveries the remaining lease no longer covers", async () => {
    claims([makeDelivery({ id: "del-1" }), makeDelivery({ id: "del-2" })]);
    let now = 0;
    const mockFetch = async () => {
      now += 300_000;
      return new Response(null, { status: 200 });
    };

    await runDrain(makeWorker({ fetchImpl: mockFetch, clock: () => now }));

    expect(deliveries.markSuccess.mock.calls.map(([lease]) => lease.id)).toEqual(["del-1"]);
    expect(deliveries.release.mock.calls.map(([lease]) => lease.id)).toEqual(["del-2"]);
  });

  it("claims no more deliveries than the lease covers with a settle margin", async () => {
    await runDrain(makeWorker());
    await runDrain(makeWorker({ options: { ...OPTIONS, leaseSeconds: 120 } }));

    expect(deliveries.claim.mock.calls.map(([request]) => request)).toEqual([
      { limit: 8, leaseSeconds: 330 },
      { limit: 2, leaseSeconds: 120 },
    ]);
  });

  it("settles a 200 response as success on the claimed lease", async () => {
    claims([makeDelivery()]);

    await runDrain(makeWorker({ fetchImpl: respond(200) }));

    expect(deliveries.markSuccess).toHaveBeenCalledTimes(1);
    const [lease, status] = deliveries.markSuccess.mock.calls[0] ?? [];
    expect(lease).toMatchObject({ id: "del-1", attempts: 1 });
    expect(status?.unwrap()).toBe(200);
    expect(settledIn[0]).toBeDefined();
  });

  it("sends the HMAC signature in the x-webhook-signature header", async () => {
    claims([makeDelivery()]);
    let capturedHeaders: Record<string, string> | undefined;
    const mockFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(null, { status: 200 });
    };

    await runDrain(makeWorker({ fetchImpl: mockFetch }));

    expect(capturedHeaders?.["x-webhook-signature"]).toMatch(/^t=\d+,v1=[0-9a-f]+$/);
  });

  it("marks the delivery failed with a retry delay on a 500 response", async () => {
    claims([makeDelivery()]);

    await runDrain(makeWorker({ fetchImpl: respond(500) }));

    const [failure] = failures();
    expect(failure?.status).toBe("failed");
    expect(failure?.retryAfterSeconds.unwrapOr(0)).toBeGreaterThan(0);
    expect(failure?.lastError).toContain("HTTP 500");
    expect(failure?.lastResponseStatus.unwrap()).toBe(500);
  });

  it("keeps a third failed send retryable, as before the lease model", async () => {
    claims([makeDelivery({ attempts: 3 })]);

    await runDrain(makeWorker({ fetchImpl: respond(500) }));

    expect(failures().map((f) => f.status)).toEqual(["failed"]);
    expect(eventTypes()).toEqual([]);
  });

  it("dead-letters with a replay date after the fourth failed send", async () => {
    claims([makeDelivery({ attempts: 4 })]);

    await runDrain(makeWorker({ fetchImpl: respond(500) }));

    const [failure] = failures();
    expect(failure?.status).toBe("dead_letter");
    expect(failure?.retryAfterSeconds.unwrap()).toBe(21_600);
  });

  it("captures a fetch abort and marks the delivery failed", async () => {
    claims([makeDelivery()]);
    const instrumentation = mockInstrumentation();
    const captureSpy = instrumentation.capture;
    const mockFetch = async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    };

    await runDrain(makeWorker({ instrumentation, fetchImpl: mockFetch }));

    expect(captureSpy).toHaveBeenCalled();
    expect(failures().map((f) => f.status)).toEqual(["failed"]);
  });

  it("keeps a delivery retryable when the endpoint lookup fails", async () => {
    endpointLookupFails = true;
    claims([makeDelivery()]);

    await runDrain(makeWorker());

    expect(failures()).toEqual([
      expect.objectContaining({ status: "failed", lastError: "endpoint lookup db error" }),
    ]);
  });

  it("dead-letters for good when the endpoint is missing", async () => {
    dbTransactionResult = [];
    claims([makeDelivery()]);

    await runDrain(makeWorker());

    expect(failures()).toEqual([
      expect.objectContaining({ status: "dead_letter", retryAfterSeconds: Option.none() }),
    ]);
  });

  it("marks the delivery failed when the master key is missing", async () => {
    claims([makeDelivery()]);

    await runDrain(makeWorker({ masterKey: () => Option.none() }));

    expect(failures().map((f) => f.status)).toEqual(["failed"]);
  });

  it("signs with both secrets while the previous secret is within grace", async () => {
    dbTransactionResult = [
      {
        ...FAKE_ENDPOINT,
        previousSecretCipher: "oldcipher",
        previousSecretExpiresAt: new Date(Date.now() + 3_600_000),
      },
    ];
    claims([makeDelivery()]);
    let sig: string | undefined;
    const mockFetch = async (_u: unknown, init?: RequestInit) => {
      sig = (init?.headers as Record<string, string> | undefined)?.["x-webhook-signature"];
      return new Response(null, { status: 200 });
    };

    await runDrain(makeWorker({ fetchImpl: mockFetch }));

    expect(sig?.match(/v1=/g)?.length).toBe(2);
  });

  it("dead-letters for good without fetching when the url is not publicly routable", async () => {
    dbTransactionResult = [{ ...FAKE_ENDPOINT, url: "http://127.0.0.1/hook" }];
    claims([makeDelivery()]);
    let fetched = false;
    const mockFetch = async () => {
      fetched = true;
      return new Response(null, { status: 200 });
    };

    await runDrain(makeWorker({ fetchImpl: mockFetch }));

    expect(fetched).toBe(false);
    expect(failures()).toEqual([
      expect.objectContaining({ status: "dead_letter", retryAfterSeconds: Option.none() }),
    ]);
    expect(eventTypes()).toEqual([EventTypes.WEBHOOK_DELIVERY_EXHAUSTED]);
  });

  it("records an attempt numbered by the lease with request headers and status 200", async () => {
    claims([makeDelivery({ attempts: 3 })]);

    await runDrain(makeWorker({ fetchImpl: respond(200, JSON.stringify({ ok: true })) }));

    const [attempt] = attempts();
    expect(attempts()).toHaveLength(1);
    expect(attempt?.deliveryId).toBe("del-1");
    expect(attempt?.attemptNumber).toBe(3);
    expect(attempt?.responseStatus.unwrap()).toBe(200);
    expect(attempt?.requestHeaders.unwrap()).toMatchObject({ "content-type": "application/json" });
    expect(attempt?.error.isNone()).toBe(true);
    expect(typeof attempt?.durationMs.unwrap()).toBe("number");
  });

  it("caps the recorded response body at WEBHOOK_RESPONSE_CAPTURE_BYTES (4096)", async () => {
    claims([makeDelivery()]);

    await runDrain(makeWorker({ fetchImpl: respond(200, "x".repeat(8192)) }));

    const [attempt] = attempts();
    expect(attempt?.responseBody.unwrap().length).toBeLessThanOrEqual(4096);
  });

  it("records an attempt with no status and an error when fetch throws", async () => {
    claims([makeDelivery()]);
    const mockFetch = async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    };

    await runDrain(makeWorker({ fetchImpl: mockFetch }));

    const [attempt] = attempts();
    expect(attempts()).toHaveLength(1);
    expect(attempt?.responseStatus.isNone()).toBe(true);
    expect(attempt?.error.isSome()).toBe(true);
  });

  it("records an attempt with an error and no response when SSRF blocks the url", async () => {
    dbTransactionResult = [{ ...FAKE_ENDPOINT, url: "http://192.168.1.1/hook" }];
    claims([makeDelivery()]);

    await runDrain(makeWorker());

    const [attempt] = attempts();
    expect(attempts()).toHaveLength(1);
    expect(attempt?.responseStatus.isNone()).toBe(true);
    expect(attempt?.responseHeaders.isNone()).toBe(true);
    expect(attempt?.responseBody.isNone()).toBe(true);
    expect(attempt?.error.isSome()).toBe(true);
  });

  it.each([307, 308])(
    "fails a %i delivery without posting to the redirect target",
    async (status) => {
      let targetHits = 0;
      const target = serve({
        port: 0,
        fetch: () => {
          targetHits++;
          return new Response(null, { status: 200 });
        },
      });
      const location = `http://127.0.0.1:${target.port}/internal`;
      const endpoint = serve({
        port: 0,
        fetch: () => new Response(null, { status, headers: { location } }),
      });
      const realFetchToLocalEndpoint = (_url: string | URL | Request, init?: RequestInit) =>
        fetch(`http://127.0.0.1:${endpoint.port}/hook`, init);
      claims([makeDelivery()]);

      try {
        await runDrain(makeWorker({ fetchImpl: realFetchToLocalEndpoint }));
      } finally {
        endpoint.stop(true);
        target.stop(true);
      }

      const [failure] = failures();
      const [attempt] = attempts();
      expect(targetHits).toBe(0);
      expect(deliveries.markSuccess).not.toHaveBeenCalled();
      expect(failure?.status).toBe("failed");
      expect(failure?.retryAfterSeconds.unwrapOr(0)).toBeGreaterThan(0);
      expect(failure?.lastResponseStatus.unwrap()).toBe(status);
      expect(attempt?.responseStatus.unwrap()).toBe(status);
      expect(attempt?.responseHeaders.unwrap()).toMatchObject({ location });
    },
  );

  it("resets the endpoint failure counter on success", async () => {
    claims([makeDelivery()]);

    await runDrain(makeWorker({ fetchImpl: respond(200) }));

    expect(endpoints.calls.resetFailure).toEqual(["ep-1"]);
  });

  it("a replayed dead delivery that succeeds clears dead_letter", async () => {
    claims([makeDelivery({ status: "dead_letter", attempts: 7 })]);

    await runDrain(makeWorker({ fetchImpl: respond(200) }));

    expect(deliveries.markSuccess).toHaveBeenCalledTimes(1);
    expect(endpoints.calls.resetFailure).toEqual(["ep-1"]);
    expect(eventTypes()).toEqual([]);
  });

  it("a replayed dead delivery for a disabled endpoint becomes terminal", async () => {
    dbTransactionResult = [{ ...FAKE_ENDPOINT, enabled: false }];
    claims([makeDelivery({ status: "dead_letter", attempts: 7 })]);

    await runDrain(makeWorker({ fetchImpl: respond(200) }));

    expect(failures()).toEqual([
      expect.objectContaining({ status: "dead_letter", retryAfterSeconds: Option.none() }),
    ]);
    expect(eventTypes()).toEqual([]);
  });

  it("emits WEBHOOK_DELIVERY_EXHAUSTED in the settle's unit of work on the first death", async () => {
    claims([makeDelivery({ attempts: 4 })]);

    await runDrain(makeWorker({ fetchImpl: respond(500) }));

    expect(enqueuedEvents(outbox).map(({ eventType, payload }) => [eventType, payload])).toEqual([
      [
        EventTypes.WEBHOOK_DELIVERY_EXHAUSTED,
        expect.objectContaining({ deliveryId: "del-1", attempts: 4, actorUserId: null }),
      ],
    ]);
    expect(endpoints.calls.bumpFailure).toEqual(["ep-1"]);
    expect(enqueuedIn[0]).toBeDefined();
    expect(enqueuedIn[0]).toBe(settledIn[0]);
    expect(uow.outcome()).toBe("committed");
  });

  it("emits WEBHOOK_DELIVERY_EXHAUSTED only on the first death", async () => {
    claims([makeDelivery({ status: "dead_letter", attempts: 6 })]);

    await runDrain(makeWorker({ fetchImpl: respond(500) }));

    expect(failures().map((f) => f.status)).toEqual(["dead_letter"]);
    expect(eventTypes()).toEqual([]);
    expect(endpoints.calls.bumpFailure).toEqual([]);
  });

  it("skips attempt side effects counters and events when the settle wrote nothing", async () => {
    claims([makeDelivery({ id: "del-1", attempts: 5 }), makeDelivery({ id: "del-2" })]);
    deliveries.markFailed.mockResolvedValue(Result.ok(false));
    deliveries.markSuccess.mockResolvedValue(Result.ok(false));
    let call = 0;
    const mockFetch = async () => new Response(null, { status: call++ === 0 ? 500 : 200 });

    await runDrain(makeWorker({ fetchImpl: mockFetch }));

    expect(eventTypes()).toEqual([]);
    expect(endpoints.calls.bumpFailure).toEqual([]);
    expect(endpoints.calls.resetFailure).toEqual([]);
    expect(attempts().map(({ deliveryId }) => deliveryId)).toEqual(["del-1", "del-2"]);
  });

  it("disables the endpoint and emits WEBHOOK_ENDPOINT_DISABLED after old repeated failures", async () => {
    endpoints = makeFakeEndpoints({
      bumpFailureResult: Promise.resolve(
        Result.ok(
          Option.some({
            consecutiveFailures: 3,
            firstFailedAt: new Date(Date.now() - 6 * 86_400_000),
          }),
        ),
      ) as BumpFailureResult,
    });
    claims([makeDelivery({ attempts: 5 })]);

    await runDrain(makeWorker({ fetchImpl: respond(500) }));

    expect(endpoints.calls.markDisabled).toContain("ep-1");
    expect(eventTypes()).toContain(EventTypes.WEBHOOK_ENDPOINT_DISABLED);
  });

  it("keeps the endpoint enabled after recent or few failures", async () => {
    endpoints = makeFakeEndpoints({
      bumpFailureResult: Promise.resolve(
        Result.ok(Option.some({ consecutiveFailures: 1, firstFailedAt: new Date() })),
      ) as BumpFailureResult,
    });
    claims([makeDelivery({ attempts: 5 })]);

    await runDrain(makeWorker({ fetchImpl: respond(500) }));

    expect(endpoints.calls.markDisabled).toHaveLength(0);
    expect(eventTypes()).not.toContain(EventTypes.WEBHOOK_ENDPOINT_DISABLED);
  });

  it("releases unstarted deliveries on stop", async () => {
    claims([
      makeDelivery({ id: "del-1" }),
      makeDelivery({ id: "del-2" }),
      makeDelivery({ id: "del-3" }),
    ]);
    let answer: () => void = () => {};
    const firstFetch = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const mockFetch = async () => {
      await firstFetch;
      return new Response(null, { status: 200 });
    };
    const worker = makeWorker({ fetchImpl: mockFetch });

    const draining = runDrain(worker);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const stopping = worker.stop();
    answer();
    await Promise.all([draining, stopping]);

    expect(deliveries.markSuccess.mock.calls.map(([lease]) => lease.id)).toEqual(["del-1"]);
    expect(deliveries.release.mock.calls.map(([lease]) => lease.id)).toEqual(["del-2", "del-3"]);
  });
});

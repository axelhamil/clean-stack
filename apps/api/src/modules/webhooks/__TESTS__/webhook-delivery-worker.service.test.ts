import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import * as realDrizzle from "@packages/drizzle";
import { noopOutbox } from "../../../shared/__TESTS__/outbox-fakes";
import * as realAead from "../../../shared/aead";
import type { Logger } from "../../../shared/logger";
import type { IInstrumentation } from "../../../shared/ports/instrumentation.port";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import * as realSsrfGuard from "../../../shared/ssrf-guard";
import type {
  IWebhookDeliveryRepository,
  WebhookDeliveryAttemptRecord,
} from "../application/ports/webhook-delivery.port";
import type { IWebhookEndpointRepository } from "../application/ports/webhook-endpoint.port";

// ---------------------------------------------------------------------------
// Drizzle mock: scoped to this file's module registry, invisible to other files.
// ---------------------------------------------------------------------------
let dbTransactionResult: unknown = [];
let failNextTransaction = false;

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
  transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
    if (failNextTransaction) {
      failNextTransaction = false;
      throw new Error("connection refused");
    }
    const fakeTx = {
      execute: async () => {},
      select: () => makeQueryChain(() => dbTransactionResult),
      insert: () => makeQueryChain(() => []),
      update: () => makeQueryChain(() => []),
      delete: () => makeQueryChain(() => []),
    };
    return cb(fakeTx);
  },
};

// ---------------------------------------------------------------------------
// SSRF guard mock: avoids real DNS in tests; checks literal private IPs
// ---------------------------------------------------------------------------
mock.module("../../../shared/ssrf-guard", () => {
  const PRIVATE_HOSTS = ["127.0.0.1", "localhost", "0.0.0.0", "::1"];
  return {
    ...realSsrfGuard,
    assertPublicUrl: async (rawUrl: string) => {
      try {
        const url = new URL(rawUrl);
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
    },
  };
});

mock.module("@packages/drizzle", () => ({ ...realDrizzle, db: fakeDb }));

// ---------------------------------------------------------------------------
// AEAD mock: returns predictable values so HMAC path is exercised
// ---------------------------------------------------------------------------
mock.module("../../../shared/aead", () => ({
  ...realAead,
  deriveOrgSubKey: (_key: Uint8Array, _orgId: string) => new Uint8Array(32),
  decryptSecret: (_cipher: string, _key: Uint8Array) => "test-webhook-secret",
  masterKeyFromHex: (_hex: string) => new Uint8Array(32),
  encryptSecret: (_plaintext: string, _key: Uint8Array) => "ciphertext",
}));

const { WebhookDeliveryWorker } = await import(
  "../infrastructure/services/webhook-delivery-worker.service"
);
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDelivery() {
  return {
    id: "del-1",
    endpointId: "ep-1",
    outboxEventId: "evt-1",
    eventType: "USER_CREATED",
    payload: { userId: "u1" },
    status: "pending" as const,
    attempts: 0,
    nextAttemptAt: Option.none<Date>(),
    lastError: Option.none<string>(),
    lastResponseStatus: Option.none<number>(),
    idempotencyKey: "idem-1",
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };
}

function makeFakeDeliveries(deliveries: ReturnType<typeof makeDelivery>[] = [makeDelivery()]) {
  const updates: { id: string; update: unknown }[] = [];
  const createAttempts: Omit<WebhookDeliveryAttemptRecord, "id" | "createdAt">[] = [];
  let callCount = 0;
  return {
    updates,
    createAttempts,
    findPendingBatch: async (_limit: number, _tx: unknown) => {
      callCount++;
      return Result.ok(callCount === 1 ? deliveries : []) as unknown as ReturnType<
        IWebhookDeliveryRepository["findPendingBatch"]
      >;
    },
    updateStatus: async (id: string, update: unknown, _tx: unknown) => {
      updates.push({ id, update });
      return Result.ok() as unknown as ReturnType<IWebhookDeliveryRepository["updateStatus"]>;
    },
    createAttempt: async (
      args: Omit<WebhookDeliveryAttemptRecord, "id" | "createdAt">,
      _tx: unknown,
    ) => {
      createAttempts.push(args);
      return Result.ok() as unknown as ReturnType<IWebhookDeliveryRepository["createAttempt"]>;
    },
    list: async () => Result.ok({ items: [], nextCursor: Option.none() }),
    findById: async () => Option.none(),
    enqueueReplay: async () => Result.ok(Option.none()),
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
    bumpFailure: async (id: string, _orgId: string, _tx: unknown) => {
      calls.bumpFailure.push(id);
      return opts?.bumpFailureResult ?? Result.ok(Option.none());
    },
    resetFailure: async (id: string, _orgId: string, _tx: unknown) => {
      calls.resetFailure.push(id);
      return Result.ok(undefined as never);
    },
    markDisabled: async (id: string, _orgId: string, _date: Date, _tx: unknown) => {
      calls.markDisabled.push(id);
      return Result.ok(undefined as never);
    },
    create: async () => Result.ok({} as never),
    update: async () => Result.ok(Option.none()),
    delete: async () => Result.ok(false),
    findById: async () => Option.none(),
    listByOrg: async () => Result.ok([]),
  };
}

function makeOutbox() {
  const enqueueCalls: Array<{ events: unknown[]; opts: unknown; tx: unknown }> = [];
  const outbox: IOutboxRepository = {
    enqueue: mock(async (events, opts, tx) => {
      enqueueCalls.push({ events: events as unknown[], opts, tx });
    }),
    findPendingBatch: mock(async () => []),
    markDispatched: mock(async () => {}),
    markFailed: mock(async () => {}),
  };
  return { outbox, enqueueCalls };
}

const FAKE_ENDPOINT = {
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

function makeLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: function () {
      return this;
    },
  };
}

type WorkerDeps = {
  deliveries: ReturnType<typeof makeFakeDeliveries>;
  endpoints?: ReturnType<typeof makeFakeEndpoints>;
  masterKey?: () => Option<Uint8Array>;
  outbox?: IOutboxRepository;
  logger?: ReturnType<typeof makeLogger>;
  instrumentation?: IInstrumentation;
  fetchImpl?: unknown;
};

function makeWorker(deps: WorkerDeps) {
  return new WebhookDeliveryWorker(
    deps.deliveries as unknown as IWebhookDeliveryRepository,
    (deps.endpoints ?? makeFakeEndpoints()) as unknown as IWebhookEndpointRepository,
    deps.masterKey ?? (() => Option.some(new Uint8Array(32))),
    deps.outbox ?? noopOutbox,
    (deps.logger ?? makeLogger()) as unknown as Logger,
    deps.instrumentation ?? new NoOpInstrumentation(),
    deps.fetchImpl as typeof fetch | undefined,
  );
}

type WorkerWithPrivates = {
  drain: () => Promise<void>;
};

async function runDrain(worker: InstanceType<typeof WebhookDeliveryWorker>) {
  await (worker as unknown as WorkerWithPrivates).drain();
}

describe("WebhookDeliveryWorker", () => {
  beforeEach(() => {
    dbTransactionResult = [FAKE_ENDPOINT];
    failNextTransaction = false;
  });

  it("start() then stop() shuts down cleanly without a blocking loop", async () => {
    const fakeDeliveries = makeFakeDeliveries([]);
    const worker = makeWorker({ deliveries: fakeDeliveries });

    await worker.start();
    await new Promise((r) => setTimeout(r, 20));
    await worker.stop();
  });

  it("reports a failing first drain instead of leaving an unhandled rejection", async () => {
    failNextTransaction = true;
    const logger = makeLogger();
    const errorSpy = spyOn(logger, "error");
    const instrumentation = new NoOpInstrumentation();
    const captureSpy = spyOn(instrumentation, "capture");
    const worker = makeWorker({ deliveries: makeFakeDeliveries([]), logger, instrumentation });

    await worker.start();
    await new Promise((r) => setTimeout(r, 20));
    await worker.stop();

    expect(captureSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.anything(), "webhook delivery drain failed");
  });

  it("marks the delivery success on a 200 response", async () => {
    const fakeDeliveries = makeFakeDeliveries();
    const mockFetch = async () => new Response(null, { status: 200, statusText: "OK" });

    const worker = makeWorker({ deliveries: fakeDeliveries, fetchImpl: mockFetch });

    await runDrain(worker);

    const successUpdate = fakeDeliveries.updates.find(
      (u) => (u.update as { status: string }).status === "success",
    );
    if (!successUpdate) throw new Error("successUpdate not found");
    expect((successUpdate.update as { attempts: number }).attempts).toBe(1);
  });

  it("sends the HMAC signature in the x-webhook-signature header", async () => {
    const fakeDeliveries = makeFakeDeliveries();
    let capturedHeaders: Record<string, string> | undefined;

    const mockFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(null, { status: 200 });
    };

    const worker = makeWorker({ deliveries: fakeDeliveries, fetchImpl: mockFetch });

    await runDrain(worker);

    expect(capturedHeaders).toBeDefined();
    const sig = capturedHeaders?.["x-webhook-signature"];
    expect(sig).toMatch(/^t=\d+,v1=[0-9a-f]+$/);
  });

  it("marks the delivery failed with a scheduled retry on a 500 response", async () => {
    const fakeDeliveries = makeFakeDeliveries();
    const mockFetch = async () =>
      new Response(null, {
        status: 500,
        statusText: "Internal Server Error",
      });

    const worker = makeWorker({ deliveries: fakeDeliveries, fetchImpl: mockFetch });

    await runDrain(worker);

    const failUpdate = fakeDeliveries.updates.find(
      (u) => (u.update as { status: string }).status === "failed",
    );
    expect(failUpdate).toBeDefined();
    const update = failUpdate?.update as {
      status: string;
      nextAttemptAt: Option<Date>;
      lastError: Option<string>;
    };
    expect(update.nextAttemptAt.isSome()).toBe(true);
    expect(update.lastError.isSome()).toBe(true);
    expect(update.lastError.unwrap()).toContain("HTTP 500");
  });

  it("captures a fetch abort and marks the delivery failed", async () => {
    const fakeDeliveries = makeFakeDeliveries();
    const instrumentation = new NoOpInstrumentation();
    const captureSpy = spyOn(instrumentation, "capture");

    const mockFetch = async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    };

    const worker = makeWorker({
      deliveries: fakeDeliveries,
      instrumentation,
      fetchImpl: mockFetch,
    });

    await runDrain(worker);

    expect(captureSpy).toHaveBeenCalled();

    const badUpdate = fakeDeliveries.updates.find((u) =>
      ["failed", "dead_letter"].includes((u.update as { status: string }).status),
    );
    expect(badUpdate).toBeDefined();
  });

  it("dead-letters the delivery when the endpoint is missing", async () => {
    dbTransactionResult = [];
    const fakeDeliveries = makeFakeDeliveries();

    const worker = makeWorker({ deliveries: fakeDeliveries });

    await runDrain(worker);

    const dlUpdate = fakeDeliveries.updates.find(
      (u) => (u.update as { status: string }).status === "dead_letter",
    );
    expect(dlUpdate).toBeDefined();
  });

  it("marks the delivery failed when the master key is missing", async () => {
    const fakeDeliveries = makeFakeDeliveries();

    const worker = makeWorker({ deliveries: fakeDeliveries, masterKey: () => Option.none() });

    await runDrain(worker);

    const failUpdate = fakeDeliveries.updates.find((u) =>
      ["failed", "dead_letter"].includes((u.update as { status: string }).status),
    );
    expect(failUpdate).toBeDefined();
  });

  it("signs with both secrets while the previous secret is within grace", async () => {
    dbTransactionResult = [
      {
        ...FAKE_ENDPOINT,
        previousSecretCipher: "oldcipher",
        previousSecretExpiresAt: new Date(Date.now() + 3_600_000),
      },
    ];
    let sig: string | undefined;
    const mockFetch = async (_u: unknown, init?: RequestInit) => {
      sig = (init?.headers as Record<string, string> | undefined)?.["x-webhook-signature"];
      return new Response(null, { status: 200 });
    };

    const fakeDeliveries = makeFakeDeliveries();
    const worker = makeWorker({ deliveries: fakeDeliveries, fetchImpl: mockFetch });

    await runDrain(worker);

    expect(sig?.match(/v1=/g)?.length).toBe(2);
  });

  it("marks dead_letter without fetching when the endpoint url is not publicly routable", async () => {
    dbTransactionResult = [{ ...FAKE_ENDPOINT, url: "http://127.0.0.1/hook" }];
    let fetched = false;
    const mockFetch = async () => {
      fetched = true;
      return new Response(null, { status: 200 });
    };

    const fakeDeliveries = makeFakeDeliveries();
    const worker = makeWorker({ deliveries: fakeDeliveries, fetchImpl: mockFetch });

    await runDrain(worker);

    expect(fetched).toBe(false);
    expect(
      fakeDeliveries.updates.find((u) => (u.update as { status: string }).status === "dead_letter"),
    ).toBeDefined();
  });

  it("records an attempt with request headers and status 200 on success", async () => {
    const fakeDeliveries = makeFakeDeliveries();

    const mockFetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });

    const worker = makeWorker({ deliveries: fakeDeliveries, fetchImpl: mockFetch });

    await runDrain(worker);

    expect(fakeDeliveries.createAttempts).toHaveLength(1);
    const attempt = fakeDeliveries.createAttempts[0];
    expect(attempt).toBeDefined();
    if (!attempt) return;
    expect(attempt.deliveryId).toBe("del-1");
    expect(attempt.attemptNumber).toBe(1);
    expect(attempt.responseStatus.unwrap()).toBe(200);
    expect(attempt.requestHeaders.unwrap()).toMatchObject({ "content-type": "application/json" });
    expect(attempt.error.isNone()).toBe(true);
    expect(typeof attempt.durationMs.unwrap()).toBe("number");
  });

  it("caps the recorded response body at WEBHOOK_RESPONSE_CAPTURE_BYTES (4096)", async () => {
    const fakeDeliveries = makeFakeDeliveries();
    const largeBody = "x".repeat(8192);

    const mockFetch = async () => new Response(largeBody, { status: 200 });

    const worker = makeWorker({ deliveries: fakeDeliveries, fetchImpl: mockFetch });

    await runDrain(worker);

    expect(fakeDeliveries.createAttempts).toHaveLength(1);
    const [attempt0] = fakeDeliveries.createAttempts;
    if (!attempt0) throw new Error("expected one delivery attempt");
    expect(attempt0.responseBody.isSome()).toBe(true);
    expect(attempt0.responseBody.unwrap().length).toBeLessThanOrEqual(4096);
  });

  it("records an attempt with no status and an error when fetch throws", async () => {
    const fakeDeliveries = makeFakeDeliveries();

    const mockFetch = async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    };

    const worker = makeWorker({ deliveries: fakeDeliveries, fetchImpl: mockFetch });

    await runDrain(worker);

    expect(fakeDeliveries.createAttempts).toHaveLength(1);
    const [attempt] = fakeDeliveries.createAttempts;
    if (!attempt) throw new Error("expected one delivery attempt");
    expect(attempt.responseStatus.isNone()).toBe(true);
    expect(attempt.error.isSome()).toBe(true);
  });

  it("records an attempt with an error and no response when SSRF blocks the url", async () => {
    dbTransactionResult = [{ ...FAKE_ENDPOINT, url: "http://192.168.1.1/hook" }];
    const fakeDeliveries = makeFakeDeliveries();

    const worker = makeWorker({ deliveries: fakeDeliveries });

    await runDrain(worker);

    expect(fakeDeliveries.createAttempts).toHaveLength(1);
    const [attempt] = fakeDeliveries.createAttempts;
    if (!attempt) throw new Error("expected one delivery attempt");
    expect(attempt.responseStatus.isNone()).toBe(true);
    expect(attempt.responseHeaders.isNone()).toBe(true);
    expect(attempt.responseBody.isNone()).toBe(true);
    expect(attempt.error.isSome()).toBe(true);
  });

  it("resets the endpoint failure counter on success", async () => {
    const fakeDeliveries = makeFakeDeliveries();
    const endpoints = makeFakeEndpoints();
    const { outbox } = makeOutbox();

    const mockFetch = async () => new Response(null, { status: 200 });

    const worker = makeWorker({
      deliveries: fakeDeliveries,
      endpoints,
      outbox,
      fetchImpl: mockFetch,
    });

    await runDrain(worker);

    expect(endpoints.calls.resetFailure).toEqual(["ep-1"]);
  });

  it("emits WEBHOOK_DELIVERY_EXHAUSTED when the delivery is dead-lettered", async () => {
    const delivery = { ...makeDelivery(), attempts: 4 };
    const fakeDeliveries = makeFakeDeliveries([delivery]);
    const endpoints = makeFakeEndpoints();
    const { outbox, enqueueCalls } = makeOutbox();

    const mockFetch = async () => new Response(null, { status: 500 });

    const worker = makeWorker({
      deliveries: fakeDeliveries,
      endpoints,
      outbox,
      fetchImpl: mockFetch,
    });

    await runDrain(worker);

    const exhausted = enqueueCalls.find(
      ({ events }) =>
        Array.isArray(events) &&
        (events[0] as { eventType?: string } | undefined)?.eventType ===
          "webhook.delivery.exhausted",
    );
    expect(exhausted).toBeDefined();
  });

  it("disables the endpoint and emits WEBHOOK_ENDPOINT_DISABLED after old repeated failures", async () => {
    const delivery = { ...makeDelivery(), attempts: 4 };
    const fakeDeliveries = makeFakeDeliveries([delivery]);
    const endpoints = makeFakeEndpoints({
      bumpFailureResult: Promise.resolve(
        Result.ok(
          Option.some({
            consecutiveFailures: 3,
            firstFailedAt: new Date(Date.now() - 6 * 86_400_000),
          }),
        ),
      ) as BumpFailureResult,
    });
    const { outbox, enqueueCalls } = makeOutbox();

    const mockFetch = async () => new Response(null, { status: 500 });

    const worker = makeWorker({
      deliveries: fakeDeliveries,
      endpoints,
      outbox,
      fetchImpl: mockFetch,
    });

    await runDrain(worker);

    expect(endpoints.calls.markDisabled).toContain("ep-1");
    const disabled = enqueueCalls.find(
      ({ events }) =>
        Array.isArray(events) &&
        (events[0] as { eventType?: string } | undefined)?.eventType ===
          "webhook.endpoint.disabled",
    );
    expect(disabled).toBeDefined();
  });

  it("keeps the endpoint enabled after recent or few failures", async () => {
    const delivery = { ...makeDelivery(), attempts: 4 };
    const fakeDeliveries = makeFakeDeliveries([delivery]);
    const endpoints = makeFakeEndpoints({
      bumpFailureResult: Promise.resolve(
        Result.ok(
          Option.some({
            consecutiveFailures: 1,
            firstFailedAt: new Date(),
          }),
        ),
      ) as BumpFailureResult,
    });
    const { outbox, enqueueCalls } = makeOutbox();

    const mockFetch = async () => new Response(null, { status: 500 });

    const worker = makeWorker({
      deliveries: fakeDeliveries,
      endpoints,
      outbox,
      fetchImpl: mockFetch,
    });

    await runDrain(worker);

    expect(endpoints.calls.markDisabled).toHaveLength(0);
    const disabled = enqueueCalls.find(
      ({ events }) =>
        Array.isArray(events) &&
        (events[0] as { eventType?: string } | undefined)?.eventType ===
          "webhook.endpoint.disabled",
    );
    expect(disabled).toBeUndefined();
  });
});

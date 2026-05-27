import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";

// ---------------------------------------------------------------------------
// Drizzle mock — full superset so parallel test files don't see missing exports
// ---------------------------------------------------------------------------
let dbTransactionResult: unknown = [];

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

mock.module("@packages/drizzle", () => ({
  db: fakeDb,
  eq: () => ({}),
  and: (..._args: unknown[]) => ({}),
  or: (..._args: unknown[]) => ({}),
  isNotNull: () => ({}),
  isNull: () => ({}),
  lt: () => ({}),
  lte: () => ({}),
  gt: () => ({}),
  gte: () => ({}),
  not: () => ({}),
  desc: () => ({}),
  inArray: () => ({}),
  like: () => ({}),
  count: () => ({}),
  arrayContains: () => ({}),
  sql: Object.assign((_strings: TemplateStringsArray, ..._values: unknown[]) => ({}), {
    raw: () => ({}),
  }),
  schema: {},
  authSchema: {},
  multiTenantSchema: {},
  outboxSchema: { outboxEvent: {} },
  auditLogSchema: { auditLog: {} },
  webhooksSchema: {
    webhookEndpoint: {
      id: "id",
      url: "url",
      organizationId: "organization_id",
      secretCipher: "secret_cipher",
      enabled: "enabled",
      $inferSelect: {},
      $inferInsert: {},
    },
    webhookDelivery: {
      id: {},
      endpointId: {},
      outboxEventId: {},
      eventType: {},
      payload: {},
      status: {},
      attempts: {},
      nextAttemptAt: {},
      lastError: {},
      lastResponseStatus: {},
      idempotencyKey: {},
      createdAt: {},
    },
  },
  trackEventsOnSuccess: () => {},
  TransactionService: class {},
  uuidv7: () => "generated-uuid",
}));

// ---------------------------------------------------------------------------
// AEAD mock — returns predictable values so HMAC path is exercised
// ---------------------------------------------------------------------------
mock.module("../../../shared/aead", () => ({
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
  const updates: Array<{ id: string; update: unknown }> = [];
  let callCount = 0;
  return {
    updates,
    findPendingBatch: async (_limit: number, _tx: unknown) => {
      callCount++;
      return Result.ok(callCount === 1 ? deliveries : []) as unknown as ReturnType<
        import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository["findPendingBatch"]
      >;
    },
    updateStatus: async (id: string, update: unknown, _tx: unknown) => {
      updates.push({ id, update });
      return Result.ok() as unknown as ReturnType<
        import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository["updateStatus"]
      >;
    },
    list: async () => Result.ok({ items: [], nextCursor: Option.none() }),
    findById: async () => Option.none(),
    enqueueReplay: async () => Result.ok(Option.none()),
  };
}

const FAKE_ENDPOINT = {
  id: "ep-1",
  url: "https://example.com/hook",
  organizationId: "org-1",
  secretCipher: "c2VjcmV0Y2lwaGVydGV4dA==",
  enabled: true,
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

type WorkerWithPrivates = {
  drain: () => Promise<void>;
};

async function runDrain(worker: InstanceType<typeof WebhookDeliveryWorker>) {
  await (worker as unknown as WorkerWithPrivates).drain();
}

describe("WebhookDeliveryWorker", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    dbTransactionResult = [FAKE_ENDPOINT];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // start / stop
  // -------------------------------------------------------------------------
  it("start() puis stop() s'arrête proprement sans boucle bloquante", async () => {
    const fakeDeliveries = makeFakeDeliveries([]);
    const worker = new WebhookDeliveryWorker({
      deliveries:
        fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      masterKey: () => Option.some(new Uint8Array(32)),
      logger: makeLogger() as unknown as import("../../../shared/logger").Logger,
      instrumentation: new NoOpInstrumentation(),
    });

    await worker.start();
    await new Promise((r) => setTimeout(r, 20));
    await worker.stop();
    // test completes without hanging
  });

  // -------------------------------------------------------------------------
  // Happy path — 200 OK → status=success
  // -------------------------------------------------------------------------
  it("delivery 200 OK → updateStatus avec status=success", async () => {
    const fakeDeliveries = makeFakeDeliveries();
    globalThis.fetch = (async () =>
      new Response(null, { status: 200, statusText: "OK" })) as unknown as typeof fetch;

    const worker = new WebhookDeliveryWorker({
      deliveries:
        fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      masterKey: () => Option.some(new Uint8Array(32)),
      logger: makeLogger() as unknown as import("../../../shared/logger").Logger,
      instrumentation: new NoOpInstrumentation(),
    });

    await runDrain(worker);

    const successUpdate = fakeDeliveries.updates.find(
      (u) => (u.update as { status: string }).status === "success",
    );
    expect(successUpdate).toBeDefined();
    expect((successUpdate?.update as { attempts: number }).attempts).toBe(1);
  });

  // -------------------------------------------------------------------------
  // HMAC signature présente dans les headers
  // -------------------------------------------------------------------------
  it("HMAC signature présente dans le header x-webhook-signature", async () => {
    const fakeDeliveries = makeFakeDeliveries();
    let capturedHeaders: Record<string, string> | undefined;

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const worker = new WebhookDeliveryWorker({
      deliveries:
        fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      masterKey: () => Option.some(new Uint8Array(32)),
      logger: makeLogger() as unknown as import("../../../shared/logger").Logger,
      instrumentation: new NoOpInstrumentation(),
    });

    await runDrain(worker);

    expect(capturedHeaders).toBeDefined();
    const sig = capturedHeaders?.["x-webhook-signature"];
    expect(sig).toMatch(/^t=\d+,v1=[0-9a-f]+$/);
  });

  // -------------------------------------------------------------------------
  // Failure path — 500 → status failed + retry scheduled
  // -------------------------------------------------------------------------
  it("delivery 500 → status failed avec nextAttemptAt planifié", async () => {
    const fakeDeliveries = makeFakeDeliveries();
    globalThis.fetch = (async () =>
      new Response(null, {
        status: 500,
        statusText: "Internal Server Error",
      })) as unknown as typeof fetch;

    const worker = new WebhookDeliveryWorker({
      deliveries:
        fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      masterKey: () => Option.some(new Uint8Array(32)),
      logger: makeLogger() as unknown as import("../../../shared/logger").Logger,
      instrumentation: new NoOpInstrumentation(),
    });

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

  // -------------------------------------------------------------------------
  // Timeout / abort → capture appelé + delivery marquée failed/dead_letter
  // -------------------------------------------------------------------------
  it("fetch abort (timeout) → capture appelé + delivery marquée failed", async () => {
    const fakeDeliveries = makeFakeDeliveries();
    const instrumentation = new NoOpInstrumentation();
    const captureSpy = spyOn(instrumentation, "capture");

    globalThis.fetch = (async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    }) as unknown as typeof fetch;

    const worker = new WebhookDeliveryWorker({
      deliveries:
        fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      masterKey: () => Option.some(new Uint8Array(32)),
      logger: makeLogger() as unknown as import("../../../shared/logger").Logger,
      instrumentation,
    });

    await runDrain(worker);

    expect(captureSpy).toHaveBeenCalled();

    const badUpdate = fakeDeliveries.updates.find((u) =>
      ["failed", "dead_letter"].includes((u.update as { status: string }).status),
    );
    expect(badUpdate).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Endpoint inexistant / disabled → dead_letter
  // -------------------------------------------------------------------------
  it("endpoint introuvable → dead_letter", async () => {
    dbTransactionResult = [];
    const fakeDeliveries = makeFakeDeliveries();

    const worker = new WebhookDeliveryWorker({
      deliveries:
        fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      masterKey: () => Option.some(new Uint8Array(32)),
      logger: makeLogger() as unknown as import("../../../shared/logger").Logger,
      instrumentation: new NoOpInstrumentation(),
    });

    await runDrain(worker);

    const dlUpdate = fakeDeliveries.updates.find(
      (u) => (u.update as { status: string }).status === "dead_letter",
    );
    expect(dlUpdate).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // masterKey absent → delivery marquée failed/dead_letter
  // -------------------------------------------------------------------------
  it("masterKey absent → delivery marquée failed ou dead_letter", async () => {
    const fakeDeliveries = makeFakeDeliveries();

    const worker = new WebhookDeliveryWorker({
      deliveries:
        fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      masterKey: () => Option.none(),
      logger: makeLogger() as unknown as import("../../../shared/logger").Logger,
      instrumentation: new NoOpInstrumentation(),
    });

    await runDrain(worker);

    const failUpdate = fakeDeliveries.updates.find((u) =>
      ["failed", "dead_letter"].includes((u.update as { status: string }).status),
    );
    expect(failUpdate).toBeDefined();
  });
});

import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";

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

// ---------------------------------------------------------------------------
// SSRF guard mock — avoids real DNS in tests; checks literal private IPs
// ---------------------------------------------------------------------------
mock.module("../../../shared/ssrf-guard", () => {
  const PRIVATE_HOSTS = ["127.0.0.1", "localhost", "0.0.0.0", "::1"];
  return {
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
    isPrivateOrReservedAddress: (_ip: string) => false,
  };
});

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
  asc: () => ({}),
  desc: () => ({}),
  inArray: () => ({}),
  like: () => ({}),
  count: () => ({}),
  arrayContains: () => ({}),
  sql: Object.assign((_strings: TemplateStringsArray, ..._values: unknown[]) => ({}), {
    raw: () => ({}),
    identifier: () => ({}),
  }),
  schema: {},
  authSchema: {},
  multiTenantSchema: { organization: { id: {} } },
  outboxSchema: { outboxEvent: {} },
  auditLogSchema: { auditLog: {} },
  rateLimitSchema: { rateLimitRecord: { key: {}, points: {}, expire: {} } },
  billingSchema: {},
  quotaUsageSchema: {
    quotaUsage: { organizationId: {}, resource: {}, periodStart: {}, used: {}, updatedAt: {} },
  },
  policiesSchema: {},
  consentSchema: {},
  notificationSchema: {
    notification: {
      id: { name: "id" },
      userId: { name: "user_id" },
      organizationId: { name: "organization_id" },
      category: { name: "category" },
      eventType: { name: "event_type" },
      groupKey: { name: "group_key" },
      dedupKey: { name: "dedup_key" },
      payload: { name: "payload" },
      readAt: { name: "read_at" },
      emailPendingAt: { name: "email_pending_at" },
      emailSentAt: { name: "email_sent_at" },
      createdAt: { name: "created_at" },
    },
    notificationPreference: {
      id: { name: "id" },
      scope: { name: "scope" },
      scopeId: { name: "scope_id" },
      category: { name: "category" },
      channel: { name: "channel" },
      enabled: { name: "enabled" },
      frequency: { name: "frequency" },
      locked: { name: "locked" },
    },
  },
  webhooksSchema: {
    webhookEndpoint: {
      id: "id",
      url: "url",
      organizationId: "organization_id",
      secretCipher: "secret_cipher",
      previousSecretCipher: "previous_secret_cipher",
      previousSecretExpiresAt: "previous_secret_expires_at",
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
  const updates: { id: string; update: unknown }[] = [];
  const createAttempts: Omit<
    import("../application/ports/webhook-delivery.port").WebhookDeliveryAttemptRecord,
    "id" | "createdAt"
  >[] = [];
  let callCount = 0;
  return {
    updates,
    createAttempts,
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
    createAttempt: async (
      args: Omit<
        import("../application/ports/webhook-delivery.port").WebhookDeliveryAttemptRecord,
        "id" | "createdAt"
      >,
      _tx: unknown,
    ) => {
      createAttempts.push(args);
      return Result.ok() as unknown as ReturnType<
        import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository["createAttempt"]
      >;
    },
    list: async () => Result.ok({ items: [], nextCursor: Option.none() }),
    findById: async () => Option.none(),
    enqueueReplay: async () => Result.ok(Option.none()),
  };
}

type BumpFailureResult = ReturnType<
  import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository["bumpFailure"]
>;

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

const noopOutbox: IOutboxRepository = {
  enqueue: mock(async () => {}),
  findPendingBatch: mock(async () => []),
  markDispatched: mock(async () => {}),
  markFailed: mock(async () => {}),
};

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

type WorkerWithPrivates = {
  drain: () => Promise<void>;
};

async function runDrain(worker: InstanceType<typeof WebhookDeliveryWorker>) {
  await (worker as unknown as WorkerWithPrivates).drain();
}

describe("WebhookDeliveryWorker", () => {
  beforeEach(() => {
    dbTransactionResult = [FAKE_ENDPOINT];
  });

  // -------------------------------------------------------------------------
  // start / stop
  // -------------------------------------------------------------------------
  it("start() puis stop() s'arrête proprement sans boucle bloquante", async () => {
    const fakeDeliveries = makeFakeDeliveries([]);
    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      makeFakeEndpoints() as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      noopOutbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
    );

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
    const mockFetch = async () => new Response(null, { status: 200, statusText: "OK" });

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      makeFakeEndpoints() as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      noopOutbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );

    await runDrain(worker);

    const successUpdate = fakeDeliveries.updates.find(
      (u) => (u.update as { status: string }).status === "success",
    );
    if (!successUpdate) throw new Error("successUpdate not found");
    expect((successUpdate.update as { attempts: number }).attempts).toBe(1);
  });

  // -------------------------------------------------------------------------
  // HMAC signature présente dans les headers
  // -------------------------------------------------------------------------
  it("HMAC signature présente dans le header x-webhook-signature", async () => {
    const fakeDeliveries = makeFakeDeliveries();
    let capturedHeaders: Record<string, string> | undefined;

    const mockFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(null, { status: 200 });
    };

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      makeFakeEndpoints() as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      noopOutbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );

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
    const mockFetch = async () =>
      new Response(null, {
        status: 500,
        statusText: "Internal Server Error",
      });

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      makeFakeEndpoints() as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      noopOutbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );

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

    const mockFetch = async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    };

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      makeFakeEndpoints() as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      noopOutbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      instrumentation,
      mockFetch as unknown as typeof fetch,
    );

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

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      makeFakeEndpoints() as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      noopOutbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
    );

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

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      makeFakeEndpoints() as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.none(),
      noopOutbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
    );

    await runDrain(worker);

    const failUpdate = fakeDeliveries.updates.find((u) =>
      ["failed", "dead_letter"].includes((u.update as { status: string }).status),
    );
    expect(failUpdate).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Dual-secret — two v1= entries when previous secret is within grace period
  // -------------------------------------------------------------------------
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
    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      makeFakeEndpoints() as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      noopOutbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );

    await runDrain(worker);

    expect(sig?.match(/v1=/g)?.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // SSRF — dead_letter without fetching for a private URL
  // -------------------------------------------------------------------------
  it("marks dead_letter without fetching when the endpoint url is not publicly routable", async () => {
    dbTransactionResult = [{ ...FAKE_ENDPOINT, url: "http://127.0.0.1/hook" }];
    let fetched = false;
    const mockFetch = async () => {
      fetched = true;
      return new Response(null, { status: 200 });
    };

    const fakeDeliveries = makeFakeDeliveries();
    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      makeFakeEndpoints() as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      noopOutbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );

    await runDrain(worker);

    expect(fetched).toBe(false);
    expect(
      fakeDeliveries.updates.find((u) => (u.update as { status: string }).status === "dead_letter"),
    ).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Task 5 — per-attempt persistence
  // -------------------------------------------------------------------------
  it("200 OK → createAttempt appelé avec requestHeaders + responseStatus=200", async () => {
    const fakeDeliveries = makeFakeDeliveries();

    const mockFetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      makeFakeEndpoints() as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      noopOutbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );

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

  it("responseBody capé à WEBHOOK_RESPONSE_CAPTURE_BYTES (4096)", async () => {
    const fakeDeliveries = makeFakeDeliveries();
    const largeBody = "x".repeat(8192);

    const mockFetch = async () => new Response(largeBody, { status: 200 });

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      makeFakeEndpoints() as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      noopOutbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );

    await runDrain(worker);

    expect(fakeDeliveries.createAttempts).toHaveLength(1);
    const [attempt0] = fakeDeliveries.createAttempts;
    if (!attempt0) throw new Error("expected one delivery attempt");
    expect(attempt0.responseBody.isSome()).toBe(true);
    expect(attempt0.responseBody.unwrap().length).toBeLessThanOrEqual(4096);
  });

  it("transport-error (fetch throws) → createAttempt avec responseStatus=null et error non-null", async () => {
    const fakeDeliveries = makeFakeDeliveries();

    const mockFetch = async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    };

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      makeFakeEndpoints() as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      noopOutbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );

    await runDrain(worker);

    expect(fakeDeliveries.createAttempts).toHaveLength(1);
    const [attempt] = fakeDeliveries.createAttempts;
    if (!attempt) throw new Error("expected one delivery attempt");
    expect(attempt.responseStatus.isNone()).toBe(true);
    expect(attempt.error.isSome()).toBe(true);
  });

  it("SSRF bloqué → createAttempt appelé avec error, champs réponse null", async () => {
    dbTransactionResult = [{ ...FAKE_ENDPOINT, url: "http://192.168.1.1/hook" }];
    const fakeDeliveries = makeFakeDeliveries();

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      makeFakeEndpoints() as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      noopOutbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
    );

    await runDrain(worker);

    expect(fakeDeliveries.createAttempts).toHaveLength(1);
    const [attempt] = fakeDeliveries.createAttempts;
    if (!attempt) throw new Error("expected one delivery attempt");
    expect(attempt.responseStatus.isNone()).toBe(true);
    expect(attempt.responseHeaders.isNone()).toBe(true);
    expect(attempt.responseBody.isNone()).toBe(true);
    expect(attempt.error.isSome()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Task 6 — endpoint failure lifecycle
  // -------------------------------------------------------------------------
  it("success → resetFailure appelé sur l'endpoint", async () => {
    const fakeDeliveries = makeFakeDeliveries();
    const endpoints = makeFakeEndpoints();
    const { outbox } = makeOutbox();

    const mockFetch = async () => new Response(null, { status: 200 });

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      endpoints as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      outbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );

    await runDrain(worker);

    expect(endpoints.calls.resetFailure).toEqual(["ep-1"]);
  });

  it("dead_letter → WEBHOOK_DELIVERY_EXHAUSTED émis dans l'outbox", async () => {
    const delivery = { ...makeDelivery(), attempts: 4 };
    const fakeDeliveries = makeFakeDeliveries([delivery]);
    const endpoints = makeFakeEndpoints();
    const { outbox, enqueueCalls } = makeOutbox();

    const mockFetch = async () => new Response(null, { status: 500 });

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      endpoints as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      outbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );

    await runDrain(worker);

    const exhausted = enqueueCalls.find(
      ({ events }) =>
        Array.isArray(events) &&
        (events[0] as { eventType?: string } | undefined)?.eventType ===
          "webhook.delivery.exhausted",
    );
    expect(exhausted).toBeDefined();
  });

  it("bumpFailure ancien + count élevé → markDisabled + WEBHOOK_ENDPOINT_DISABLED émis", async () => {
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

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      endpoints as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      outbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );

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

  it("bumpFailure récent/count bas → markDisabled NOT appelé", async () => {
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

    const worker = new WebhookDeliveryWorker(
      fakeDeliveries as unknown as import("../application/ports/webhook-delivery.port").IWebhookDeliveryRepository,
      endpoints as unknown as import("../application/ports/webhook-endpoint.port").IWebhookEndpointRepository,
      () => Option.some(new Uint8Array(32)),
      outbox,
      makeLogger() as unknown as import("../../../shared/logger").Logger,
      new NoOpInstrumentation(),
      mockFetch as unknown as typeof fetch,
    );

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

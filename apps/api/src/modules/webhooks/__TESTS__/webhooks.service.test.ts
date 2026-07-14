import { describe, expect, it, mock, spyOn } from "bun:test";
import type { IUnitOfWork } from "@packages/ddd-kit";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type { ITransaction } from "../../../shared/transaction";
import type {
  DeliveryPage,
  IWebhookDeliveryRepository,
  WebhookDeliveryAttemptRecord,
  WebhookDeliveryRecord,
} from "../application/ports/webhook-delivery.port";
import type {
  IWebhookEndpointRepository,
  WebhookEndpointRecord,
  WebhookRepoError,
} from "../application/ports/webhook-endpoint.port";
import {
  type MasterKeyProvider,
  masterKeyProvider,
  WebhooksService,
} from "../application/services/webhooks.service";

// ─── shared stubs ──────────────────────────────────────────────────────────

const ORG_ID = "org-1";
const USER_ID = "user-1";
const ENDPOINT_ID = "ep-1";
const DELIVERY_ID = "del-1";

const stubEndpoint: WebhookEndpointRecord = {
  id: ENDPOINT_ID,
  organizationId: ORG_ID,
  url: "https://example.com/hook",
  secretCipher: "encrypted",
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

const stubDelivery: WebhookDeliveryRecord = {
  id: DELIVERY_ID,
  endpointId: ENDPOINT_ID,
  outboxEventId: "outbox-1",
  eventType: "user.created",
  payload: { userId: "u1" },
  status: "failed",
  attempts: 2,
  nextAttemptAt: Option.none(),
  lastError: Option.some("connection refused"),
  lastResponseStatus: Option.none(),
  idempotencyKey: "idem-1",
  createdAt: new Date("2024-01-01"),
};

const stubDeliveryWithAttempts = {
  ...stubDelivery,
  attemptHistory: [
    {
      id: "att-1",
      deliveryId: DELIVERY_ID,
      attemptNumber: 1,
      requestHeaders: null,
      requestBody: null,
      responseStatus: null,
      responseHeaders: null,
      responseBody: null,
      durationMs: null,
      error: "connection refused",
      createdAt: new Date("2024-01-01"),
    },
  ],
};

const MASTER_KEY_HEX = "a".repeat(64);
const validMasterKey: MasterKeyProvider = masterKeyProvider(MASTER_KEY_HEX);
const noMasterKey: MasterKeyProvider = masterKeyProvider(undefined);

const tx: IUnitOfWork<ITransaction> = {
  startTransaction: async (cb) => cb({} as ITransaction),
  run: async (cb) => cb({} as ITransaction),
};

const noopOutbox: IOutboxRepository = {
  enqueue: mock(async () => {}),
  findPendingBatch: mock(async () => []),
  markDispatched: mock(async () => {}),
  markFailed: mock(async () => {}),
};

function makeEndpoints(
  overrides: Partial<IWebhookEndpointRepository> = {},
): IWebhookEndpointRepository {
  return {
    create: mock(async () => Result.ok<WebhookEndpointRecord, WebhookRepoError>(stubEndpoint)),
    update: mock(async () =>
      Result.ok<Option<WebhookEndpointRecord>, WebhookRepoError>(Option.some(stubEndpoint)),
    ),
    delete: mock(async () => Result.ok<boolean, WebhookRepoError>(true)),
    findById: mock(async () => Option.some(stubEndpoint)),
    listByOrg: mock(async () =>
      Result.ok<WebhookEndpointRecord[], WebhookRepoError>([stubEndpoint]),
    ),
    applySecretRotation: mock(async () =>
      Result.ok<Option<WebhookEndpointRecord>, WebhookRepoError>(Option.some(stubEndpoint)),
    ),
    ...overrides,
  } as unknown as IWebhookEndpointRepository;
}

function makeDeliveries(
  overrides: Partial<IWebhookDeliveryRepository> = {},
): IWebhookDeliveryRepository {
  const page: DeliveryPage = { items: [stubDelivery], nextCursor: Option.none() };
  return {
    list: mock(async () => Result.ok<DeliveryPage, WebhookRepoError>(page)),
    findById: mock(async () => Option.some(stubDelivery)),
    updateStatus: mock(async () => Result.ok<void, WebhookRepoError>()),
    findPendingBatch: mock(async () => Result.ok([])),
    enqueueReplay: mock(async () =>
      Result.ok<Option<WebhookDeliveryRecord>, WebhookRepoError>(Option.some(stubDelivery)),
    ),
    enqueueTargeted: mock(async () =>
      Result.ok<WebhookDeliveryRecord, WebhookRepoError>(stubDelivery),
    ),
    findByIdWithAttempts: mock(async () => Option.some(stubDeliveryWithAttempts)),
    ...overrides,
  } as unknown as IWebhookDeliveryRepository;
}

function makeService(
  opts: {
    endpoints?: IWebhookEndpointRepository;
    deliveries?: IWebhookDeliveryRepository;
    masterKey?: MasterKeyProvider;
  } = {},
): WebhooksService {
  return new WebhooksService(
    opts.endpoints ?? makeEndpoints(),
    opts.deliveries ?? makeDeliveries(),
    tx,
    noopOutbox,
    opts.masterKey ?? validMasterKey,
    new NoOpInstrumentation(),
  );
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("WebhooksService", () => {
  describe("createEndpoint", () => {
    it("creates endpoint and returns record + plaintextSecret (happy path)", async () => {
      const service = makeService();
      const result = await service.createEndpoint({
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        url: "https://example.com/hook",
        eventTypes: ["user.created"],
        enabled: true,
      });

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.endpoint).toEqual(stubEndpoint);
      expect(val.plaintextSecret).toMatch(/^whsec_/);
    });

    it("returns WEBHOOK_MASTER_KEY_UNAVAILABLE when master key not configured", async () => {
      const service = makeService({ masterKey: noMasterKey });
      const result = await service.createEndpoint({
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        url: "https://example.com/hook",
        eventTypes: [],
        enabled: true,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_MASTER_KEY_UNAVAILABLE");
    });

    it("propagates repo failure from endpoints.create", async () => {
      const endpoints = makeEndpoints({
        create: mock(async () =>
          Result.fail<WebhookEndpointRecord, WebhookRepoError>({
            code: "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE",
            message: "DB error",
          }),
        ),
      });
      const service = makeService({ endpoints });
      const result = await service.createEndpoint({
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        url: "https://example.com/hook",
        eventTypes: [],
        enabled: true,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
    });

    it("calls instrumentation span with op=function", async () => {
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new WebhooksService(
        makeEndpoints(),
        makeDeliveries(),
        tx,
        noopOutbox,
        validMasterKey,
        instrumentation,
      );

      await service.createEndpoint({
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        url: "https://example.com/hook",
        eventTypes: [],
        enabled: true,
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "WebhooksService > createEndpoint",
          op: "function",
        }),
        expect.any(Function),
      );
    });
  });

  describe("updateEndpoint", () => {
    it("returns updated endpoint (happy path)", async () => {
      const service = makeService();
      const result = await service.updateEndpoint({
        id: ENDPOINT_ID,
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        url: "https://93.184.216.34/hook", // use IP to avoid DNS in sandboxed env
      });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isSome()).toBe(true);
    });

    it("returns Option.none() when endpoint not found", async () => {
      const endpoints = makeEndpoints({
        update: mock(async () =>
          Result.ok<Option<WebhookEndpointRecord>, WebhookRepoError>(Option.none()),
        ),
      });
      const service = makeService({ endpoints });
      const result = await service.updateEndpoint({
        id: "nonexistent",
        organizationId: ORG_ID,
        actorUserId: USER_ID,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isNone()).toBe(true);
    });

    it("propagates repo failure", async () => {
      const endpoints = makeEndpoints({
        update: mock(async () =>
          Result.fail<Option<WebhookEndpointRecord>, WebhookRepoError>({
            code: "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE",
            message: "DB error",
          }),
        ),
      });
      const service = makeService({ endpoints });
      const result = await service.updateEndpoint({
        id: ENDPOINT_ID,
        organizationId: ORG_ID,
        actorUserId: USER_ID,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
    });

    it("re-enable flows through and returns endpoint with reset failure counters", async () => {
      const reEnabledEndpoint: WebhookEndpointRecord = {
        ...stubEndpoint,
        enabled: true,
        consecutiveFailures: 0,
        firstFailedAt: null,
        disabledAt: null,
      };
      const endpoints = makeEndpoints({
        update: mock(async () =>
          Result.ok<Option<WebhookEndpointRecord>, WebhookRepoError>(
            Option.some(reEnabledEndpoint),
          ),
        ),
      });
      const service = makeService({ endpoints });
      const result = await service.updateEndpoint({
        id: ENDPOINT_ID,
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        enabled: true,
      });

      expect(result.isSuccess).toBe(true);
      const opt = result.getValue();
      expect(opt.isSome()).toBe(true);
      const record = opt.unwrap();
      expect(record.consecutiveFailures).toBe(0);
      expect(record.disabledAt).toBeNull();
    });

    it("calls instrumentation span with op=function", async () => {
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new WebhooksService(
        makeEndpoints(),
        makeDeliveries(),
        tx,
        noopOutbox,
        validMasterKey,
        instrumentation,
      );

      await service.updateEndpoint({
        id: ENDPOINT_ID,
        organizationId: ORG_ID,
        actorUserId: USER_ID,
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "WebhooksService > updateEndpoint", op: "function" }),
        expect.any(Function),
      );
    });
  });

  describe("deleteEndpoint", () => {
    it("returns true when endpoint deleted (happy path)", async () => {
      const service = makeService();
      const result = await service.deleteEndpoint(ENDPOINT_ID, ORG_ID, USER_ID);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe(true);
    });

    it("returns false when endpoint does not exist (no event emitted)", async () => {
      const endpoints = makeEndpoints({
        delete: mock(async () => Result.ok<boolean, WebhookRepoError>(false)),
      });
      const service = makeService({ endpoints });
      const result = await service.deleteEndpoint("nonexistent", ORG_ID, USER_ID);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe(false);
    });

    it("propagates repo failure", async () => {
      const endpoints = makeEndpoints({
        delete: mock(async () =>
          Result.fail<boolean, WebhookRepoError>({
            code: "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE",
            message: "DB error",
          }),
        ),
      });
      const service = makeService({ endpoints });
      const result = await service.deleteEndpoint(ENDPOINT_ID, ORG_ID, USER_ID);

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
    });

    it("calls instrumentation span with op=function", async () => {
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new WebhooksService(
        makeEndpoints(),
        makeDeliveries(),
        tx,
        noopOutbox,
        validMasterKey,
        instrumentation,
      );

      await service.deleteEndpoint(ENDPOINT_ID, ORG_ID, USER_ID);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "WebhooksService > deleteEndpoint", op: "function" }),
        expect.any(Function),
      );
    });
  });

  describe("listEndpoints", () => {
    it("returns list of endpoints (happy path)", async () => {
      const service = makeService();
      const result = await service.listEndpoints(ORG_ID);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual([stubEndpoint]);
    });

    it("returns empty array when no endpoints", async () => {
      const endpoints = makeEndpoints({
        listByOrg: mock(async () => Result.ok<WebhookEndpointRecord[], WebhookRepoError>([])),
      });
      const service = makeService({ endpoints });
      const result = await service.listEndpoints(ORG_ID);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toHaveLength(0);
    });

    it("propagates repo failure", async () => {
      const endpoints = makeEndpoints({
        listByOrg: mock(async () =>
          Result.fail<WebhookEndpointRecord[], WebhookRepoError>({
            code: "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE",
            message: "DB error",
          }),
        ),
      });
      const service = makeService({ endpoints });
      const result = await service.listEndpoints(ORG_ID);

      expect(result.isFailure).toBe(true);
    });

    it("calls instrumentation span with op=function", async () => {
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new WebhooksService(
        makeEndpoints(),
        makeDeliveries(),
        tx,
        noopOutbox,
        validMasterKey,
        instrumentation,
      );

      await service.listEndpoints(ORG_ID);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "WebhooksService > listEndpoints", op: "function" }),
        expect.any(Function),
      );
    });
  });

  describe("findEndpoint", () => {
    it("returns Some(endpoint) when found", async () => {
      const service = makeService();
      const opt = await service.findEndpoint(ENDPOINT_ID, ORG_ID);

      expect(opt.isSome()).toBe(true);
      expect(opt.unwrap()).toEqual(stubEndpoint);
    });

    it("returns None when not found", async () => {
      const endpoints = makeEndpoints({
        findById: mock(async () => Option.none<WebhookEndpointRecord>()),
      });
      const service = makeService({ endpoints });
      const opt = await service.findEndpoint("nonexistent", ORG_ID);

      expect(opt.isNone()).toBe(true);
    });

    it("calls instrumentation span with op=function", async () => {
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new WebhooksService(
        makeEndpoints(),
        makeDeliveries(),
        tx,
        noopOutbox,
        validMasterKey,
        instrumentation,
      );

      await service.findEndpoint(ENDPOINT_ID, ORG_ID);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "WebhooksService > findEndpoint", op: "function" }),
        expect.any(Function),
      );
    });
  });

  describe("listDeliveries", () => {
    it("returns delivery page (happy path)", async () => {
      const service = makeService();
      const result = await service.listDeliveries({
        endpointId: ENDPOINT_ID,
        organizationId: ORG_ID,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().items).toHaveLength(1);
    });

    it("filters by status when provided", async () => {
      const deliveries = makeDeliveries();
      const service = makeService({ deliveries });
      await service.listDeliveries({
        endpointId: ENDPOINT_ID,
        organizationId: ORG_ID,
        status: "failed",
      });

      expect(deliveries.list).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    });

    it("propagates repo failure", async () => {
      const deliveries = makeDeliveries({
        list: mock(async () =>
          Result.fail<DeliveryPage, WebhookRepoError>({
            code: "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE",
            message: "DB error",
          }),
        ),
      });
      const service = makeService({ deliveries });
      const result = await service.listDeliveries({
        endpointId: ENDPOINT_ID,
        organizationId: ORG_ID,
      });

      expect(result.isFailure).toBe(true);
    });

    it("calls instrumentation span with op=function", async () => {
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new WebhooksService(
        makeEndpoints(),
        makeDeliveries(),
        tx,
        noopOutbox,
        validMasterKey,
        instrumentation,
      );

      await service.listDeliveries({ endpointId: ENDPOINT_ID, organizationId: ORG_ID });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "WebhooksService > listDeliveries", op: "function" }),
        expect.any(Function),
      );
    });
  });

  describe("rotateSecret", () => {
    it("generates a new secret, moves the current to previous, emits, returns plaintext", async () => {
      const enqueueMock = mock(async () => {});
      const spiedOutbox = {
        enqueue: enqueueMock,
        findPendingBatch: mock(async () => []),
        markDispatched: mock(async () => {}),
        markFailed: mock(async () => {}),
      } as unknown as IOutboxRepository;
      const endpoints = makeEndpoints({
        findById: mock(async () => Option.some(stubEndpoint)),
        applySecretRotation: mock(async () =>
          Result.ok<Option<WebhookEndpointRecord>, WebhookRepoError>(Option.some(stubEndpoint)),
        ),
      });
      const service = new WebhooksService(
        endpoints,
        makeDeliveries(),
        tx,
        spiedOutbox,
        validMasterKey,
        new NoOpInstrumentation(),
      );
      const r = await service.rotateSecret({
        id: ENDPOINT_ID,
        organizationId: ORG_ID,
        actorUserId: USER_ID,
      });
      expect(r.isSuccess).toBe(true);
      expect(r.getValue().isSome()).toBe(true);
      expect(r.getValue().unwrap().plaintextSecret).toMatch(/^whsec_/);
      expect(enqueueMock).toHaveBeenCalledTimes(1);
      expect(enqueueMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ eventType: EventTypes.WEBHOOK_ENDPOINT_SECRET_ROTATED }),
        ]),
        expect.any(Object),
        expect.any(Object),
      );
    });
    it("returns None when endpoint not found", async () => {
      const endpoints = makeEndpoints({
        findById: mock(async () => Option.none<WebhookEndpointRecord>()),
      });
      const service = makeService({ endpoints });
      const r = await service.rotateSecret({
        id: "nope",
        organizationId: ORG_ID,
        actorUserId: USER_ID,
      });
      expect(r.isSuccess).toBe(true);
      expect(r.getValue().isNone()).toBe(true);
    });
    it("returns WEBHOOK_MASTER_KEY_UNAVAILABLE when master key not configured", async () => {
      const service = makeService({ masterKey: noMasterKey });
      const result = await service.rotateSecret({
        id: ENDPOINT_ID,
        organizationId: ORG_ID,
        actorUserId: USER_ID,
      });
      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_MASTER_KEY_UNAVAILABLE");
    });
  });

  describe("sendTest", () => {
    it("emits webhook.test event and enqueues targeted delivery, returns Some(delivery)", async () => {
      const enqueueTargeted = mock(async () =>
        Result.ok<WebhookDeliveryRecord, WebhookRepoError>(stubDelivery),
      );
      const deliveries = makeDeliveries({ enqueueTargeted });
      const enqueueMock = mock(async () => {});
      const spiedOutbox = {
        enqueue: enqueueMock,
        findPendingBatch: mock(async () => []),
        markDispatched: mock(async () => {}),
        markFailed: mock(async () => {}),
      } as unknown as IOutboxRepository;
      const service = new WebhooksService(
        makeEndpoints(),
        deliveries,
        tx,
        spiedOutbox,
        validMasterKey,
        new NoOpInstrumentation(),
      );

      const result = await service.sendTest({
        id: ENDPOINT_ID,
        organizationId: ORG_ID,
        actorUserId: USER_ID,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isSome()).toBe(true);
      expect(result.getValue().unwrap()).toEqual(stubDelivery);
      expect(enqueueMock).toHaveBeenCalledTimes(1);
      expect(enqueueMock).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ eventType: EventTypes.WEBHOOK_TEST })]),
        expect.any(Object),
        expect.any(Object),
      );
      const [[firstArg]] = (enqueueTargeted as ReturnType<typeof mock>).mock.calls as [
        [{ outboxEventId: string }, unknown],
      ];
      expect(typeof firstArg.outboxEventId).toBe("string");
      expect(firstArg.outboxEventId.length).toBeGreaterThan(0);
    });

    it("returns Option.none() when endpoint not found, no enqueue", async () => {
      const endpoints = makeEndpoints({
        findById: mock(async () => Option.none<WebhookEndpointRecord>()),
      });
      const enqueueTargeted = mock(async () =>
        Result.ok<WebhookDeliveryRecord, WebhookRepoError>(stubDelivery),
      );
      const deliveries = makeDeliveries({ enqueueTargeted });
      const service = makeService({ endpoints, deliveries });

      const result = await service.sendTest({
        id: "nonexistent",
        organizationId: ORG_ID,
        actorUserId: USER_ID,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isNone()).toBe(true);
      expect(enqueueTargeted).not.toHaveBeenCalled();
    });

    it("calls instrumentation span with op=function", async () => {
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new WebhooksService(
        makeEndpoints(),
        makeDeliveries(),
        tx,
        noopOutbox,
        validMasterKey,
        instrumentation,
      );

      await service.sendTest({ id: ENDPOINT_ID, organizationId: ORG_ID, actorUserId: USER_ID });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "WebhooksService > sendTest", op: "function" }),
        expect.any(Function),
      );
    });
  });

  describe("replayDelivery", () => {
    it("returns Some(delivery) when replay enqueued (happy path)", async () => {
      const service = makeService();
      const result = await service.replayDelivery(DELIVERY_ID, ORG_ID);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isSome()).toBe(true);
      expect(result.getValue().unwrap()).toEqual(stubDelivery);
    });

    it("returns None when delivery not found in org scope", async () => {
      const deliveries = makeDeliveries({
        enqueueReplay: mock(async () =>
          Result.ok<Option<WebhookDeliveryRecord>, WebhookRepoError>(Option.none()),
        ),
      });
      const service = makeService({ deliveries });
      const result = await service.replayDelivery("nonexistent", ORG_ID);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isNone()).toBe(true);
    });

    it("propagates repo failure", async () => {
      const deliveries = makeDeliveries({
        enqueueReplay: mock(async () =>
          Result.fail<Option<WebhookDeliveryRecord>, WebhookRepoError>({
            code: "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE",
            message: "DB error",
          }),
        ),
      });
      const service = makeService({ deliveries });
      const result = await service.replayDelivery(DELIVERY_ID, ORG_ID);

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
    });

    it("calls instrumentation span with op=function", async () => {
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new WebhooksService(
        makeEndpoints(),
        makeDeliveries(),
        tx,
        noopOutbox,
        validMasterKey,
        instrumentation,
      );

      await service.replayDelivery(DELIVERY_ID, ORG_ID);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "WebhooksService > replayDelivery", op: "function" }),
        expect.any(Function),
      );
    });
  });

  describe("findDelivery", () => {
    it("returns Some(delivery with attemptHistory) when found", async () => {
      const service = makeService();
      const opt = await service.findDelivery(DELIVERY_ID, ORG_ID);

      expect(opt.isSome()).toBe(true);
      const val = opt.unwrap();
      expect(val.id).toBe(DELIVERY_ID);
      expect(Array.isArray(val.attemptHistory)).toBe(true);
      expect(val.attemptHistory).toHaveLength(1);
    });

    it("returns None when delivery not found", async () => {
      const deliveries = makeDeliveries({
        findByIdWithAttempts: mock(async () =>
          Option.none<WebhookDeliveryRecord & { attemptHistory: WebhookDeliveryAttemptRecord[] }>(),
        ),
      });
      const service = makeService({ deliveries });
      const opt = await service.findDelivery("nonexistent", ORG_ID);

      expect(opt.isNone()).toBe(true);
    });

    it("calls instrumentation span with op=function", async () => {
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new WebhooksService(
        makeEndpoints(),
        makeDeliveries(),
        tx,
        noopOutbox,
        validMasterKey,
        instrumentation,
      );

      await service.findDelivery(DELIVERY_ID, ORG_ID);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "WebhooksService > findDelivery", op: "function" }),
        expect.any(Function),
      );
    });
  });

  describe("createEndpoint SSRF guard", () => {
    it("returns WEBHOOK_URL_FORBIDDEN for private IP (127.0.0.1)", async () => {
      const service = makeService();
      const result = await service.createEndpoint({
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        url: "http://127.0.0.1/hook",
        eventTypes: ["user.created"],
        enabled: true,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_URL_FORBIDDEN");
    });
  });

  describe("updateEndpoint SSRF guard", () => {
    it("returns WEBHOOK_URL_FORBIDDEN when url is a private address", async () => {
      const service = makeService();
      const result = await service.updateEndpoint({
        id: ENDPOINT_ID,
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        url: "http://192.168.1.1/hook",
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_URL_FORBIDDEN");
    });

    it("does not trigger SSRF guard when url is not provided", async () => {
      const service = makeService();
      const result = await service.updateEndpoint({
        id: ENDPOINT_ID,
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        enabled: true,
      });

      expect(result.isSuccess).toBe(true);
    });
  });
});

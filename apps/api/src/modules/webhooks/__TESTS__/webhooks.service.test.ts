import { describe, expect, it, mock, spyOn } from "bun:test";
import type { IUnitOfWork } from "@packages/ddd-kit";
import { Option, Result } from "@packages/ddd-kit";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type { ITransaction } from "../../../shared/transaction";
import type {
  DeliveryPage,
  IWebhookDeliveryRepository,
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
        url: "https://new.example.com/hook",
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
});

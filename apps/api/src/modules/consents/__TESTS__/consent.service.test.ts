import { describe, expect, it, mock } from "bun:test";
import type { IUnitOfWork } from "@packages/ddd-kit";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type {
  ConsentError,
  ConsentRecordRow,
  IConsentStore,
} from "../application/ports/consent.port";
import { ConsentService } from "../application/services/consent.service";

const fakeTx = {} as never;

const noopUow: IUnitOfWork<never> = {
  startTransaction: async (cb) => cb(fakeTx),
  run: async (cb) => cb(fakeTx),
};

const noopOutbox: IOutboxRepository = {
  enqueue: async () => {},
  findPendingBatch: async () => [],
  markDispatched: async () => {},
  markFailed: async () => {},
};

const activeRow: ConsentRecordRow = {
  id: "row-1",
  subjectId: "subj-1",
  userId: "u1",
  categories: ["necessary", "analytics"],
  policyVersion: "2026-07-09",
  grantedAt: new Date(),
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180),
};

function makeStore(overrides: Partial<IConsentStore> = {}): IConsentStore {
  return {
    insert: mock(async () => Result.ok<void, ConsentError>()),
    findActiveBySubject: mock(async () => Result.ok<ConsentRecordRow | null, ConsentError>(null)),
    findActiveByUser: mock(async () => Result.ok<ConsentRecordRow | null, ConsentError>(null)),
    linkSubjectToUser: mock(async () => Result.ok<void, ConsentError>()),
    ...overrides,
  };
}

describe("ConsentService", () => {
  describe("record", () => {
    it("inserts row with 'necessary' always included and emits USER_COOKIE_CONSENT_GRANTED", async () => {
      const enqueued: Array<{ eventType: string; aggregateId: string; payload: unknown }> = [];
      const spyOutbox: IOutboxRepository = {
        enqueue: async (events) => {
          for (const e of events)
            enqueued.push({
              eventType: e.eventType,
              aggregateId: e.aggregateId,
              payload: e.payload,
            });
        },
        findPendingBatch: async () => [],
        markDispatched: async () => {},
        markFailed: async () => {},
      };
      const store = makeStore();
      const service = new ConsentService(store, spyOutbox, noopUow, new NoOpInstrumentation());

      const result = await service.record({
        subjectId: "subj-1",
        categories: ["analytics"],
        ip: "1.2.3.4",
      });

      expect(result.isSuccess).toBe(true);
      expect(store.insert).toHaveBeenCalledTimes(1);

      const insertedRow = (store.insert as ReturnType<typeof mock>).mock
        .calls[0]?.[0] as ConsentRecordRow;
      expect(insertedRow.categories).toContain("necessary");
      expect(insertedRow.categories).toContain("analytics");

      const grantedEvents = enqueued.filter(
        (e) => e.eventType === EventTypes.USER_COOKIE_CONSENT_GRANTED,
      );
      expect(grantedEvents).toHaveLength(1);
    });

    it("propagates store failure without emitting events", async () => {
      const store = makeStore({
        insert: mock(async () =>
          Result.fail<void, ConsentError>({
            code: "CONSENT_PROVIDER_FAILURE",
            message: "db error",
          }),
        ),
      });
      const service = new ConsentService(store, noopOutbox, noopUow, new NoOpInstrumentation());

      const result = await service.record({ subjectId: "subj-1", categories: [] });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("CONSENT_PROVIDER_FAILURE");
    });

    it("always inserts a new record when a user updates preferences (append-only)", async () => {
      const store = makeStore({
        findActiveByUser: mock(async () =>
          Result.ok<ConsentRecordRow | null, ConsentError>(activeRow),
        ),
      });
      const service = new ConsentService(store, noopOutbox, noopUow, new NoOpInstrumentation());

      const result = await service.record({
        subjectId: "subj-1",
        userId: "u1",
        categories: ["functional"],
      });

      expect(result.isSuccess).toBe(true);
      expect(store.insert).toHaveBeenCalledTimes(1);
      const insertedRow = (store.insert as ReturnType<typeof mock>).mock
        .calls[0]?.[0] as ConsentRecordRow;
      expect(insertedRow.categories).toContain("functional");
      expect(insertedRow.categories).not.toContain("analytics");
    });
  });

  describe("withdraw", () => {
    it("inserts a withdrawal row with empty categories + withdrawnAt set and emits USER_COOKIE_CONSENT_WITHDRAWN", async () => {
      const enqueued: Array<{ eventType: string }> = [];
      const spyOutbox: IOutboxRepository = {
        enqueue: async (events) => {
          for (const e of events) enqueued.push({ eventType: e.eventType });
        },
        findPendingBatch: async () => [],
        markDispatched: async () => {},
        markFailed: async () => {},
      };
      const store = makeStore();
      const service = new ConsentService(store, spyOutbox, noopUow, new NoOpInstrumentation());

      const result = await service.withdraw({ subjectId: "subj-1" });

      expect(result.isSuccess).toBe(true);
      expect(store.insert).toHaveBeenCalledTimes(1);

      const insertedRow = (store.insert as ReturnType<typeof mock>).mock
        .calls[0]?.[0] as ConsentRecordRow;
      expect(insertedRow.categories).toEqual([]);
      expect(insertedRow.withdrawnAt).toBeDefined();

      const withdrawnEvents = enqueued.filter(
        (e) => e.eventType === EventTypes.USER_COOKIE_CONSENT_WITHDRAWN,
      );
      expect(withdrawnEvents).toHaveLength(1);
    });

    it("propagates store failure without emitting events", async () => {
      const store = makeStore({
        insert: mock(async () =>
          Result.fail<void, ConsentError>({
            code: "CONSENT_PROVIDER_FAILURE",
            message: "db error",
          }),
        ),
      });
      const service = new ConsentService(store, noopOutbox, noopUow, new NoOpInstrumentation());

      const result = await service.withdraw({ subjectId: "subj-1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("CONSENT_PROVIDER_FAILURE");
    });
  });

  describe("getActive", () => {
    it("delegates to findActiveByUser when userId is provided", async () => {
      const store = makeStore({
        findActiveByUser: mock(async () =>
          Result.ok<ConsentRecordRow | null, ConsentError>(activeRow),
        ),
      });
      const service = new ConsentService(store, noopOutbox, noopUow, new NoOpInstrumentation());

      const result = await service.getActive("subj-1", "2026-07-09", "u1");

      expect(result.isSuccess).toBe(true);
      expect(store.findActiveByUser).toHaveBeenCalled();
      expect(store.findActiveBySubject).not.toHaveBeenCalled();
      expect(result.getValue()).toEqual(activeRow);
    });

    it("falls back to findActiveBySubject when userId is provided but has no user record", async () => {
      const store = makeStore({
        findActiveByUser: mock(async () => Result.ok<ConsentRecordRow | null, ConsentError>(null)),
        findActiveBySubject: mock(async () =>
          Result.ok<ConsentRecordRow | null, ConsentError>(activeRow),
        ),
      });
      const service = new ConsentService(store, noopOutbox, noopUow, new NoOpInstrumentation());

      const result = await service.getActive("subj-1", "2026-07-09", "u1");

      expect(result.isSuccess).toBe(true);
      expect(store.findActiveByUser).toHaveBeenCalled();
      expect(store.findActiveBySubject).toHaveBeenCalled();
      expect(result.getValue()).toEqual(activeRow);
    });

    it("delegates to findActiveBySubject when userId is not provided", async () => {
      const store = makeStore({
        findActiveBySubject: mock(async () =>
          Result.ok<ConsentRecordRow | null, ConsentError>(null),
        ),
      });
      const service = new ConsentService(store, noopOutbox, noopUow, new NoOpInstrumentation());

      const result = await service.getActive("subj-1", "2026-07-09");

      expect(result.isSuccess).toBe(true);
      expect(store.findActiveBySubject).toHaveBeenCalled();
      expect(store.findActiveByUser).not.toHaveBeenCalled();
      expect(result.getValue()).toBeNull();
    });
  });

  describe("reconcile", () => {
    it("links the browser's orphan consent records to the user", async () => {
      const store = makeStore();
      const service = new ConsentService(store, noopOutbox, noopUow, new NoOpInstrumentation());

      const result = await service.reconcile("subj-1", "u1");

      expect(result.isSuccess).toBe(true);
      expect(store.linkSubjectToUser).toHaveBeenCalledWith("subj-1", "u1");
    });
  });
});

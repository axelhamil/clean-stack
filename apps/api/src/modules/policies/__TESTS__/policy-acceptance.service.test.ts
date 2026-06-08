import { describe, expect, it, mock } from "bun:test";
import type { IUnitOfWork } from "@packages/ddd-kit";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { POLICY_TYPES, POLICY_VERSIONS } from "@packages/policies";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type {
  IPolicyAcceptanceStore,
  PolicyError,
} from "../application/ports/policy-acceptance.port";
import { PolicyAcceptanceService } from "../application/services/policy-acceptance.service";

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

function makeStore(overrides: Partial<IPolicyAcceptanceStore> = {}): IPolicyAcceptanceStore {
  return {
    insert: mock(async () => Result.ok<void, PolicyError>()),
    findLatestVersions: mock(async () =>
      Result.ok<Partial<Record<(typeof POLICY_TYPES)[number], string>>, PolicyError>({}),
    ),
    ...overrides,
  };
}

describe("PolicyAcceptanceService", () => {
  describe("accept", () => {
    it("calls store.insert once per type with current versions and emits USER_POLICY_ACCEPTED", async () => {
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
      const service = new PolicyAcceptanceService(
        store,
        spyOutbox,
        noopUow,
        new NoOpInstrumentation(),
      );

      const result = await service.accept("u1", ["privacy", "terms"]);

      expect(result.isSuccess).toBe(true);
      expect(store.insert).toHaveBeenCalledTimes(2);
      expect(store.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u1",
          policyType: "privacy",
          policyVersion: POLICY_VERSIONS.privacy,
        }),
        fakeTx,
      );
      expect(store.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u1",
          policyType: "terms",
          policyVersion: POLICY_VERSIONS.terms,
        }),
        fakeTx,
      );

      const policyEvents = enqueued.filter((e) => e.eventType === EventTypes.USER_POLICY_ACCEPTED);
      expect(policyEvents).toHaveLength(2);
      expect(
        policyEvents.some((e) => (e.payload as Record<string, unknown>).policyType === "privacy"),
      ).toBe(true);
      expect(
        policyEvents.some((e) => (e.payload as Record<string, unknown>).policyType === "terms"),
      ).toBe(true);
    });

    it("is a no-op when types is empty", async () => {
      const store = makeStore();
      const service = new PolicyAcceptanceService(
        store,
        noopOutbox,
        noopUow,
        new NoOpInstrumentation(),
      );

      const result = await service.accept("u1", []);

      expect(result.isSuccess).toBe(true);
      expect(store.insert).not.toHaveBeenCalled();
    });

    it("propagates store failure without emitting events", async () => {
      const store = makeStore({
        insert: mock(async () =>
          Result.fail<void, PolicyError>({
            code: "POLICY_ACCEPTANCE_PROVIDER_FAILURE",
            message: "db error",
          }),
        ),
      });
      const service = new PolicyAcceptanceService(
        store,
        noopOutbox,
        noopUow,
        new NoOpInstrumentation(),
      );

      const result = await service.accept("u1", ["privacy"]);

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("POLICY_ACCEPTANCE_PROVIDER_FAILURE");
    });
  });

  describe("getStatus", () => {
    it("reports current:false when the stored version differs from POLICY_VERSIONS", async () => {
      const store = makeStore({
        findLatestVersions: mock(async () =>
          Result.ok<Partial<Record<(typeof POLICY_TYPES)[number], string>>, PolicyError>({
            privacy: "2020-01-01",
            terms: "2020-01-01",
          }),
        ),
      });
      const service = new PolicyAcceptanceService(
        store,
        noopOutbox,
        noopUow,
        new NoOpInstrumentation(),
      );

      const result = await service.getStatus("u1");

      expect(result.isSuccess).toBe(true);
      const status = result.getValue();
      expect(status.privacy.current).toBe(false);
      expect(status.privacy.acceptedVersion).toBe("2020-01-01");
      expect(status.terms.current).toBe(false);
      expect(status.terms.acceptedVersion).toBe("2020-01-01");
    });

    it("reports current:true when the stored version matches POLICY_VERSIONS", async () => {
      const store = makeStore({
        findLatestVersions: mock(async () =>
          Result.ok<Partial<Record<(typeof POLICY_TYPES)[number], string>>, PolicyError>({
            privacy: POLICY_VERSIONS.privacy,
            terms: POLICY_VERSIONS.terms,
          }),
        ),
      });
      const service = new PolicyAcceptanceService(
        store,
        noopOutbox,
        noopUow,
        new NoOpInstrumentation(),
      );

      const result = await service.getStatus("u1");

      expect(result.isSuccess).toBe(true);
      const status = result.getValue();
      expect(status.privacy.current).toBe(true);
      expect(status.terms.current).toBe(true);
    });

    it("reports current:false and acceptedVersion:null when a type was never accepted", async () => {
      const store = makeStore({
        findLatestVersions: mock(async () =>
          Result.ok<Partial<Record<(typeof POLICY_TYPES)[number], string>>, PolicyError>({}),
        ),
      });
      const service = new PolicyAcceptanceService(
        store,
        noopOutbox,
        noopUow,
        new NoOpInstrumentation(),
      );

      const result = await service.getStatus("u1");

      expect(result.isSuccess).toBe(true);
      const status = result.getValue();
      for (const t of POLICY_TYPES) {
        expect(status[t].current).toBe(false);
        expect(status[t].acceptedVersion).toBeNull();
      }
    });
  });

  describe("hasAcceptedCurrent", () => {
    it("returns true when all types have current versions accepted", async () => {
      const store = makeStore({
        findLatestVersions: mock(async () =>
          Result.ok<Partial<Record<(typeof POLICY_TYPES)[number], string>>, PolicyError>({
            privacy: POLICY_VERSIONS.privacy,
            terms: POLICY_VERSIONS.terms,
          }),
        ),
      });
      const service = new PolicyAcceptanceService(
        store,
        noopOutbox,
        noopUow,
        new NoOpInstrumentation(),
      );

      const result = await service.hasAcceptedCurrent("u1");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe(true);
    });

    it("returns false when at least one type is stale", async () => {
      const store = makeStore({
        findLatestVersions: mock(async () =>
          Result.ok<Partial<Record<(typeof POLICY_TYPES)[number], string>>, PolicyError>({
            privacy: POLICY_VERSIONS.privacy,
            terms: "2020-01-01",
          }),
        ),
      });
      const service = new PolicyAcceptanceService(
        store,
        noopOutbox,
        noopUow,
        new NoOpInstrumentation(),
      );

      const result = await service.hasAcceptedCurrent("u1");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe(false);
    });

    it("returns false when no type has been accepted", async () => {
      const store = makeStore();
      const service = new PolicyAcceptanceService(
        store,
        noopOutbox,
        noopUow,
        new NoOpInstrumentation(),
      );

      const result = await service.hasAcceptedCurrent("u1");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe(false);
    });
  });
});

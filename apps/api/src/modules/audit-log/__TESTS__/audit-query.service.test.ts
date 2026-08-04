import { describe, expect, it, mock, spyOn } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type {
  AuditError,
  AuditFilters,
  AuditPage,
  ChainVerification,
  IAuditPort,
} from "../../../shared/ports/audit.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import { AuditQueryService } from "../application/services/audit-query.service";

const stubPage: AuditPage = {
  items: [
    {
      id: "audit-1",
      actorId: Option.some("user-1"),
      actorType: "user",
      organizationId: Option.some("org-1"),
      action: "user.created",
      targetType: "user",
      targetId: "user-1",
      metadata: {},
      retention: "operational",
      occurredAt: new Date("2024-01-01"),
      prevHash: Option.none(),
      hash: Option.some("abc123"),
    },
  ],
  nextCursor: Option.none(),
};

function makeAuditPort(overrides: Partial<IAuditPort> = {}): IAuditPort {
  return {
    record: mock(async () =>
      Result.ok(stubPage.items[0] as NonNullable<(typeof stubPage.items)[0]>),
    ),
    list: mock(async () => Result.ok<AuditPage, AuditError>(stubPage)),
    ...overrides,
  } as unknown as IAuditPort;
}

describe("AuditQueryService", () => {
  describe("listForPlatform", () => {
    it("listForPlatform forwards filters straight to the port (no org injection)", async () => {
      const port = { list: mock(async () => Result.ok({ items: [], nextCursor: Option.none() })) };
      const svc = new AuditQueryService(port as unknown as IAuditPort, new NoOpInstrumentation());
      await svc.listForPlatform({ actionPrefix: "user." });
      expect(port.list).toHaveBeenCalledWith({ actionPrefix: "user." });
    });

    it("passes all filters untouched including organizationId", async () => {
      const audit = makeAuditPort();
      const service = new AuditQueryService(audit, new NoOpInstrumentation());

      const filters: AuditFilters = {
        actorId: "user-2",
        organizationId: "org-2",
        targetType: "organization",
        actionPrefix: "org.",
        limit: 10,
        cursor: "cursor-abc",
      };
      await service.listForPlatform(filters);

      expect(audit.list).toHaveBeenCalledWith(filters);
    });

    it("propagates failure from audit.list (AUDIT_PERSISTENCE_PROVIDER_FAILURE)", async () => {
      const audit = makeAuditPort({
        list: mock(async () =>
          Result.fail<AuditPage, AuditError>({
            code: "AUDIT_PERSISTENCE_PROVIDER_FAILURE",
            message: "DB down",
          }),
        ),
      });
      const service = new AuditQueryService(audit, new NoOpInstrumentation());

      const result = await service.listForPlatform({});

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("AUDIT_PERSISTENCE_PROVIDER_FAILURE");
    });

    it("calls instrumentation.startSpan with the correct span name", async () => {
      const audit = makeAuditPort();
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new AuditQueryService(audit, instrumentation);

      await service.listForPlatform({});

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "AuditQueryService > listForPlatform" }),
        expect.any(Function),
      );
    });

    it("returns empty items list when no audit entries match", async () => {
      const emptyPage: AuditPage = { items: [], nextCursor: Option.none() };
      const audit = makeAuditPort({
        list: mock(async () => Result.ok<AuditPage, AuditError>(emptyPage)),
      });
      const service = new AuditQueryService(audit, new NoOpInstrumentation());

      const result = await service.listForPlatform({});

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().items).toHaveLength(0);
      expect(result.getValue().nextCursor.isNone()).toBe(true);
    });

    it("returns nextCursor when more pages are available", async () => {
      const pageWithCursor: AuditPage = {
        items: stubPage.items,
        nextCursor: Option.some("next-page-cursor"),
      };
      const audit = makeAuditPort({
        list: mock(async () => Result.ok<AuditPage, AuditError>(pageWithCursor)),
      });
      const service = new AuditQueryService(audit, new NoOpInstrumentation());

      const result = await service.listForPlatform({ limit: 1 });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().nextCursor.isSome()).toBe(true);
      expect(result.getValue().nextCursor.unwrap()).toBe("next-page-cursor");
    });
  });

  describe("verifyChain", () => {
    it("delegates to audit.verifyChain and returns its result", async () => {
      const verdict: ChainVerification = {
        verified: true,
        rowCount: 2,
        brokenAtId: Option.none(),
        brokenAtSequence: Option.none(),
      };
      const audit = makeAuditPort({
        verifyChain: mock(async () => Result.ok<ChainVerification, AuditError>(verdict)),
      });
      const service = new AuditQueryService(audit, new NoOpInstrumentation());

      const result = await service.verifyChain();

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(verdict);
      expect(audit.verifyChain).toHaveBeenCalledTimes(1);
    });
  });
});

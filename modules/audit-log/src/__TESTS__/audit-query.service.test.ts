import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type {
  AuditError,
  AuditFilters,
  AuditPage,
  ChainVerification,
  IAuditPort,
} from "../application/ports/audit.port";
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

function makeAuditPort() {
  const audit = mockPort<IAuditPort>();
  audit.list.mockResolvedValue(Result.ok(stubPage));
  return audit;
}

describe("AuditQueryService", () => {
  describe("listForPlatform", () => {
    it("listForPlatform forwards filters straight to the port (no org injection)", async () => {
      const port = makeAuditPort();
      port.list.mockResolvedValue(Result.ok({ items: [], nextCursor: Option.none() }));
      const svc = new AuditQueryService(port, mockInstrumentation());
      await svc.listForPlatform({ actionPrefix: "user." });
      expect(port.list).toHaveBeenCalledWith({ actionPrefix: "user." });
    });

    it("passes all filters untouched including organizationId", async () => {
      const audit = makeAuditPort();
      const service = new AuditQueryService(audit, mockInstrumentation());

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
      const audit = makeAuditPort();
      audit.list.mockResolvedValue(
        Result.fail<AuditPage, AuditError>({
          code: "AUDIT_PERSISTENCE_PROVIDER_FAILURE",
          message: "DB down",
        }),
      );
      const service = new AuditQueryService(audit, mockInstrumentation());

      const result = await service.listForPlatform({});

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("AUDIT_PERSISTENCE_PROVIDER_FAILURE");
    });

    it("calls instrumentation.startSpan with the correct span name", async () => {
      const audit = makeAuditPort();
      const instrumentation = mockInstrumentation();
      const spy = instrumentation.startSpan;
      const service = new AuditQueryService(audit, instrumentation);

      await service.listForPlatform({});

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "AuditQueryService > listForPlatform" }),
        expect.any(Function),
      );
    });

    it("returns empty items list when no audit entries match", async () => {
      const emptyPage: AuditPage = { items: [], nextCursor: Option.none() };
      const audit = makeAuditPort();
      audit.list.mockResolvedValue(Result.ok(emptyPage));
      const service = new AuditQueryService(audit, mockInstrumentation());

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
      const audit = makeAuditPort();
      audit.list.mockResolvedValue(Result.ok(pageWithCursor));
      const service = new AuditQueryService(audit, mockInstrumentation());

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
      const audit = makeAuditPort();
      audit.verifyChain.mockResolvedValue(Result.ok(verdict));
      const service = new AuditQueryService(audit, mockInstrumentation());

      const result = await service.verifyChain();

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(verdict);
      expect(audit.verifyChain).toHaveBeenCalledTimes(1);
    });
  });
});

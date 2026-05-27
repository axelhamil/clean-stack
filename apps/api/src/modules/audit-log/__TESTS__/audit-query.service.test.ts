import { describe, expect, it, mock, spyOn } from "bun:test";
import { Result } from "@packages/ddd-kit";
import type {
  AuditError,
  AuditFilters,
  AuditPage,
  IAuditPort,
} from "../../../shared/ports/audit.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import { AuditQueryService } from "../application/services/audit-query.service";

const stubPage: AuditPage = {
  items: [
    {
      id: "audit-1",
      actorId: "user-1",
      actorType: "user",
      organizationId: "org-1",
      action: "user.created",
      targetType: "user",
      targetId: "user-1",
      metadata: {},
      retention: "operational",
      occurredAt: new Date("2024-01-01"),
      prevHash: null,
      hash: "abc123",
    },
  ],
  nextCursor: null,
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
  describe("listForOrg", () => {
    it("delegates to audit.list with organizationId merged into filters (happy path)", async () => {
      const audit = makeAuditPort();
      const service = new AuditQueryService(audit, new NoOpInstrumentation());

      const filters: Omit<AuditFilters, "organizationId"> = { limit: 20 };
      const result = await service.listForOrg("org-1", filters);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(stubPage);
      expect(audit.list).toHaveBeenCalledWith({ limit: 20, organizationId: "org-1" });
    });

    it("passes through optional filters untouched", async () => {
      const audit = makeAuditPort();
      const service = new AuditQueryService(audit, new NoOpInstrumentation());

      const filters: Omit<AuditFilters, "organizationId"> = {
        actorId: "user-2",
        targetType: "organization",
        actionPrefix: "org.",
        limit: 10,
        cursor: "cursor-abc",
      };
      await service.listForOrg("org-2", filters);

      expect(audit.list).toHaveBeenCalledWith({
        actorId: "user-2",
        targetType: "organization",
        actionPrefix: "org.",
        limit: 10,
        cursor: "cursor-abc",
        organizationId: "org-2",
      });
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

      const result = await service.listForOrg("org-1", {});

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("AUDIT_PERSISTENCE_PROVIDER_FAILURE");
    });

    it("calls instrumentation.startSpan with the correct span name", async () => {
      const audit = makeAuditPort();
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new AuditQueryService(audit, instrumentation);

      await service.listForOrg("org-1", {});

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "AuditQueryService > listForOrg" }),
        expect.any(Function),
      );
    });

    it("returns empty items list when org has no audit entries", async () => {
      const emptyPage: AuditPage = { items: [], nextCursor: null };
      const audit = makeAuditPort({
        list: mock(async () => Result.ok<AuditPage, AuditError>(emptyPage)),
      });
      const service = new AuditQueryService(audit, new NoOpInstrumentation());

      const result = await service.listForOrg("org-empty", {});

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().items).toHaveLength(0);
      expect(result.getValue().nextCursor).toBeNull();
    });

    it("returns nextCursor when more pages are available", async () => {
      const pageWithCursor: AuditPage = { items: stubPage.items, nextCursor: "next-page-cursor" };
      const audit = makeAuditPort({
        list: mock(async () => Result.ok<AuditPage, AuditError>(pageWithCursor)),
      });
      const service = new AuditQueryService(audit, new NoOpInstrumentation());

      const result = await service.listForOrg("org-1", { limit: 1 });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().nextCursor).toBe("next-page-cursor");
    });
  });
});

import { describe, expect, it } from "bun:test";
import { approvalRequestOf } from "../../application/mappers/approval-request.mapper";
import type { ApprovalStatusValue } from "../../domain/approval/value-objects/approval-status.vo";
import { PENDING } from "../fixtures/approval-setup";

const NOW = new Date("2026-01-01T12:00:00Z");

function requestIn(status: ApprovalStatusValue) {
  return approvalRequestOf({ ...PENDING, status }).getValue();
}

describe("ApprovalRequest transitions refused by the aggregate", () => {
  it("refuses to mark executed a request that was never approved", () => {
    const request = requestIn("pending");

    const marked = request.markExecuted("decider", NOW);

    expect(marked.getError().code).toBe("ADMIN_APPROVAL_DECIDED_CONFLICT");
    expect(request.get("status").value).toBe("pending");
    expect(request.getDomainEvents()).toEqual([]);
  });

  it("refuses to mark failed a request already settled", () => {
    const request = requestIn("rejected");

    const marked = request.markFailed("decider", "ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT", NOW);

    expect(marked.getError().code).toBe("ADMIN_APPROVAL_DECIDED_CONFLICT");
    expect(request.get("status").value).toBe("rejected");
    expect(request.get("failureReason").isNone()).toBe(true);
    expect(request.getDomainEvents()).toEqual([]);
  });

  it("refuses to expire a request already settled", () => {
    const request = requestIn("cancelled");

    const expired = request.expire(NOW);

    expect(expired.getError().code).toBe("ADMIN_APPROVAL_DECIDED_CONFLICT");
    expect(request.get("status").value).toBe("cancelled");
    expect(request.getDomainEvents()).toEqual([]);
  });

  it("refuses to close for a deleted user a request already settled", () => {
    const request = requestIn("executed");

    const closed = request.cancel(null, NOW);

    expect(closed.getError().code).toBe("ADMIN_APPROVAL_DECIDED_CONFLICT");
    expect(request.get("status").value).toBe("executed");
    expect(request.get("decidedAt").isNone()).toBe(true);
    expect(request.getDomainEvents()).toEqual([]);
  });
});

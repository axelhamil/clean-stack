import { describe, expect, it } from "bun:test";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import {
  approvalSetup,
  DECIDER_PERMISSIONS,
  PENDING,
  REF,
  REQUESTER_ROW,
} from "../../fixtures/approval-setup";

const DECISION = {
  approvalId: "a1",
  deciderUserId: "approver",
  deciderPermissions: DECIDER_PERMISSIONS,
  decision: "approve" as const,
  note: "checked",
};

describe("DecideApprovalUseCase refused before the claim", () => {
  it("keeps the request open when the decider cannot authorize this change", async () => {
    const { decide, store } = approvalSetup({
      authorized: Result.fail({ code: "ADMIN_STAFF_GRANT_NOT_HELD_FORBIDDEN", message: "no" }),
    });

    const result = await decide.execute(DECISION);

    expect(result.getError().code).toBe("ADMIN_STAFF_GRANT_NOT_HELD_FORBIDDEN");
    expect(store.claim).not.toHaveBeenCalled();
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("answers not found for an unknown request", async () => {
    const { decide, store } = approvalSetup();
    store.find.mockImplementation(async () => Result.ok(Option.none()));

    const result = await decide.execute(DECISION);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_NOT_FOUND");
    expect(store.claim).not.toHaveBeenCalled();
  });
});

describe("DecideApprovalUseCase", () => {
  it("runs the action, marks it executed and names the approver as actor", async () => {
    const { decide, store, uow, seen } = approvalSetup();

    const result = await decide.execute(DECISION);

    expect(result.isSuccess).toBe(true);
    expect(seen).toEqual([
      { action: "user.ban_permanent", subjectId: "target", params: { reason: "spam" } },
    ]);
    expect(store.markExecuted).toHaveBeenCalledWith("a1", 0);
    expect(uow.writtenEvents().map((e) => [e.eventType, e.payload])).toEqual([
      [
        EventTypes.ADMIN_APPROVAL_DECIDED,
        { ...REF, actorUserId: "approver", outcome: "approved", note: "checked" },
      ],
      [EventTypes.ADMIN_APPROVAL_EXECUTED, { ...REF, actorUserId: "approver" }],
    ]);
    expect(uow.outcome()).toBe("committed");
  });

  it("refuses the requester deciding their own request", async () => {
    const { decide, store, seen } = approvalSetup();

    const result = await decide.execute({ ...DECISION, deciderUserId: "requester" });

    expect(result.getError().code).toBe("ADMIN_APPROVAL_SELF_DECISION_FORBIDDEN");
    expect(store.claim).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it("refuses the subject deciding a request about themselves, approving or rejecting", async () => {
    for (const decision of ["approve", "reject"] as const) {
      const { decide, store } = approvalSetup();

      const result = await decide.execute({ ...DECISION, deciderUserId: "target", decision });

      expect(result.getError().code).toBe("ADMIN_APPROVAL_SUBJECT_DECISION_FORBIDDEN");
      expect(store.claim).not.toHaveBeenCalled();
    }
  });

  it("leaves the request pending when the approver lacks the power over this target", async () => {
    const refusal: AppError = { code: "ADMIN_USER_STAFF_TARGET_FORBIDDEN", message: "no" };
    const { decide, store, seen } = approvalSetup({ authorized: Result.fail(refusal) });

    const result = await decide.execute(DECISION);

    expect(result.getError().code).toBe("ADMIN_USER_STAFF_TARGET_FORBIDDEN");
    expect(store.claim).not.toHaveBeenCalled();
    expect(store.markFailed).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it("closes as failed a request whose requester no longer holds the action", async () => {
    const { decide, store, seen, uow } = approvalSetup({
      requester: Option.some({ ...REQUESTER_ROW, role: "auditor" }),
    });

    const result = await decide.execute(DECISION);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT");
    expect(seen).toEqual([]);
    expect(store.claim).not.toHaveBeenCalled();
    expect(store.markFailed.mock.calls[0]?.[0].reason).toBe(
      "ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT",
    );
    expect(uow.writtenEvents().at(-1)).toMatchObject({
      eventType: EventTypes.ADMIN_APPROVAL_FAILED,
      payload: {
        ...REF,
        actorUserId: "approver",
        reason: "ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT",
      },
    });
  });

  it("keeps the business code and tells telemetry when recording the failure breaks", async () => {
    const refusal: AppError = { code: "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN", message: "no" };

    for (const failureBreaks of ["result", "throw"] as const) {
      const { decide, capture } = approvalSetup({ executed: Result.fail(refusal), failureBreaks });

      const result = await decide.execute(DECISION);

      expect(result.getError().code).toBe("ADMIN_STAFF_LAST_MANAGER_FORBIDDEN");
      expect(capture).toHaveBeenCalledTimes(1);
    }
  });

  it("refuses an approver who lost the permission of the action", async () => {
    const { decide, store, uow } = approvalSetup();

    const result = await decide.execute({ ...DECISION, deciderPermissions: ["approvals.decide"] });

    expect(result.getError().code).toBe("ADMIN_APPROVAL_PERMISSION_FORBIDDEN");
    expect(store.claim).not.toHaveBeenCalled();
    expect(uow.writtenEvents()).toEqual([]);
  });

  it("refuses a request whose time ran out, before the sweep passes", async () => {
    const { decide, store } = approvalSetup({
      found: { ...PENDING, expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await decide.execute(DECISION);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_EXPIRED_CONFLICT");
    expect(store.claim).not.toHaveBeenCalled();
  });

  it("refuses a request already decided", async () => {
    const { decide, store } = approvalSetup({ found: { ...PENDING, status: "rejected" } });

    const result = await decide.execute(DECISION);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_DECIDED_CONFLICT");
    expect(store.claim).not.toHaveBeenCalled();
  });

  it("answers that someone else decided when the claim is lost, and marks nothing failed", async () => {
    const { decide, store, seen, uow } = approvalSetup({ claim: Option.none() });

    const result = await decide.execute(DECISION);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_DECIDED_CONFLICT");
    expect(seen).toEqual([]);
    expect(store.markFailed).not.toHaveBeenCalled();
    expect(uow.writtenEvents()).toEqual([]);
  });

  it("rolls back a refused action, then records the failure in a second unit", async () => {
    const refusal: AppError = {
      code: "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN",
      message: "The last manager cannot lose access.",
    };
    const { decide, store, uow } = approvalSetup({ executed: Result.fail(refusal) });

    const result = await decide.execute(DECISION);

    expect(result.getError().code).toBe("ADMIN_STAFF_LAST_MANAGER_FORBIDDEN");
    expect(store.markExecuted).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith({
      id: "a1",
      decidedBy: "approver",
      note: "checked",
      reason: "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN",
    });
    expect(uow.outcome()).toBe("committed");
    expect(uow.writtenEvents().map((e) => e.eventType)).toEqual([EventTypes.ADMIN_APPROVAL_FAILED]);
  });

  it("does not run params that no longer pass the route's validation", async () => {
    const { decide, store, seen } = approvalSetup({
      found: { ...PENDING, params: { reason: "" } },
    });

    const result = await decide.execute(DECISION);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_PARAMS_INVALID");
    expect(seen).toEqual([]);
    expect(store.markFailed.mock.calls[0]?.[0].reason).toBe("ADMIN_APPROVAL_PARAMS_INVALID");
  });

  it("runs nothing on a rejection", async () => {
    const { decide, store, uow, seen } = approvalSetup();

    const result = await decide.execute({ ...DECISION, decision: "reject" });

    expect(result.isSuccess).toBe(true);
    expect(seen).toEqual([]);
    expect(store.claim.mock.calls[0]?.[0]).toMatchObject({ status: "rejected" });
    expect(store.markExecuted).not.toHaveBeenCalled();
    expect(uow.writtenEvents().map((e) => e.payload)).toEqual([
      { ...REF, actorUserId: "approver", outcome: "rejected", note: "checked" },
    ]);
  });
});

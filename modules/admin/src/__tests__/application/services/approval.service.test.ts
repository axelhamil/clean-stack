import { describe, expect, it } from "bun:test";
import type { StaffPermission } from "@packages/access-control";
import { type AppError, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { ApprovalRecord } from "../../../application/ports/repositories/approval-store.port";
import { approvalSetup, PENDING, REF } from "../../fixtures/approval-setup";

const GATE = {
  action: "staff.revoke" as const,
  subjectId: "target",
  params: {},
  requestedBy: "requester",
  requesterPermissions: ["staff.manage"] satisfies StaffPermission[],
};

describe("ApprovalService.gate", () => {
  it("lets the action through when four-eyes is off", async () => {
    const { approvals, store, uow } = approvalSetup({ enabled: false });

    const result = await approvals.gate(GATE);

    expect(result.getValue().isNone()).toBe(true);
    expect(store.create).not.toHaveBeenCalled();
    expect(uow.writtenEvents()).toEqual([]);
  });

  it("lets through an action the configuration does not list", async () => {
    const { approvals, store } = approvalSetup({ actions: ["staff.role_change"] });

    const result = await approvals.gate(GATE);

    expect(result.getValue().isNone()).toBe(true);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("stores a listed action as pending and announces it", async () => {
    const { approvals, store, uow } = approvalSetup();

    const result = await approvals.gate(GATE);

    expect(result.getValue().unwrap()).toBe("a1");
    expect(store.create.mock.calls[0]?.[0]).toMatchObject({
      action: GATE.action,
      subjectId: GATE.subjectId,
      requestedBy: GATE.requestedBy,
      ttlHours: 72,
    });
    expect(uow.writtenEvents()[0]).toMatchObject({
      eventType: EventTypes.ADMIN_APPROVAL_REQUESTED,
      aggregateId: "a1",
      payload: { ...REF, actorUserId: "requester" },
    });
    expect(uow.outcome()).toBe("committed");
  });

  it("refuses a request about oneself, a colleague would change the requester's own access", async () => {
    const { approvals, store } = approvalSetup();

    const result = await approvals.gate({ ...GATE, subjectId: "requester" });

    expect(result.getError().code).toBe("ADMIN_APPROVAL_SELF_SUBJECT_FORBIDDEN");
    expect(store.create).not.toHaveBeenCalled();
  });

  it("refuses a request about an account that does not exist", async () => {
    const { approvals, store } = approvalSetup({ subjectExists: false });

    const result = await approvals.gate(GATE);

    expect(result.getError().code).toBe("ADMIN_USER_NOT_FOUND");
    expect(store.create).not.toHaveBeenCalled();
  });

  it("queues nothing the requester could not do themselves", async () => {
    const refusal: AppError = { code: "ADMIN_USER_STAFF_TARGET_FORBIDDEN", message: "no" };
    const { approvals, store, uow } = approvalSetup({ prepared: Result.fail(refusal) });

    const result = await approvals.gate(GATE);

    expect(result.getError().code).toBe("ADMIN_USER_STAFF_TARGET_FORBIDDEN");
    expect(store.create).not.toHaveBeenCalled();
    expect(uow.writtenEvents()).toEqual([]);
  });

  it("stores what the action prepared, so a role change remembers the role it starts from", async () => {
    const { approvals, store } = approvalSetup({ actions: ["staff.role_change"] });

    await approvals.gate({
      action: "staff.role_change",
      subjectId: "target",
      params: { role: "manager" },
      requestedBy: "requester",
      requesterPermissions: ["staff.manage"],
    });

    expect(store.create.mock.calls[0]?.[0].params).toEqual({
      role: "manager",
      fromRole: "support",
    });
  });

  it("answers with the request already open, without a second announcement", async () => {
    const { approvals, uow } = approvalSetup({
      created: false,
      open: { ...PENDING, action: "staff.revoke", params: {} },
    });

    const result = await approvals.gate(GATE);

    expect(result.getValue().unwrap()).toBe("a1");
    expect(uow.writtenEvents()).toEqual([]);
  });

  it("closes an overdue request on the same pair instead of answering with a dead one", async () => {
    const { approvals, store, uow } = approvalSetup();
    store.expireDueFor.mockImplementation(async () => Result.ok([PENDING]));

    await approvals.gate(GATE);

    expect(uow.writtenEvents().map((e) => [e.eventType, e.payload])).toEqual([
      [EventTypes.ADMIN_APPROVAL_EXPIRED, { ...REF, actorUserId: null }],
      [EventTypes.ADMIN_APPROVAL_REQUESTED, { ...REF, actorUserId: "requester" }],
    ]);
  });
});

describe("ApprovalService.gate on a pair already open", () => {
  const BAN = {
    ...GATE,
    action: "user.ban_permanent" as const,
    params: { reason: "fraud", expiresIn: 60 },
  };
  const open = (over: Partial<ApprovalRecord>): ApprovalRecord => ({
    ...PENDING,
    action: "staff.revoke",
    params: {},
    ...over,
  });

  it("answers with the open request when the same person repeats the same change", async () => {
    const { approvals } = approvalSetup({
      created: false,
      open: open({ params: { expiresIn: 60, reason: "fraud" } }),
    });

    const result = await approvals.gate(BAN);

    expect(result.getValue().unwrap()).toBe(PENDING.id);
  });

  it("refuses a different change, naming the request in the way", async () => {
    const { approvals } = approvalSetup({
      created: false,
      open: open({ params: { reason: "another" } }),
    });

    const result = await approvals.gate(BAN);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_ALREADY_PENDING_CONFLICT");
    expect(result.getError().metadata).toEqual({ approvalId: PENDING.id });
  });

  it("refuses the same change from someone else, the first requester owns it", async () => {
    const { approvals } = approvalSetup({
      created: false,
      open: open({ requestedBy: "someone-else" }),
    });

    const result = await approvals.gate(GATE);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_ALREADY_PENDING_CONFLICT");
  });
});

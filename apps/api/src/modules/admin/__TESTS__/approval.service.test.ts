import { describe, expect, it } from "bun:test";
import type { StaffPermission } from "@packages/access-control";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { enqueuedEvents } from "../../../shared/__TESTS__/enqueued-events";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import type { ApprovedAction } from "../application/approved-action";
import type { AdminUserRow, IAdminUserStore } from "../application/ports/admin-user-store.port";
import type { ApprovalRecord, IApprovalStore } from "../application/ports/approval-store.port";
import { ApprovalService } from "../application/services/approval.service";

const PENDING: ApprovalRecord = {
  id: "a1",
  action: "user.ban_permanent",
  subjectId: "target",
  params: { reason: "spam" },
  requestedBy: "requester",
  status: "pending",
  decidedBy: Option.none(),
  decisionNote: Option.none(),
  failureReason: Option.none(),
  expiresAt: new Date(Date.now() + 60_000),
  decidedAt: Option.none(),
  createdAt: new Date(),
  version: 0,
};

const TARGET: AdminUserRow = {
  id: "target",
  email: "target@example.com",
  name: "Target",
  banned: false,
  banReason: Option.none(),
  banExpires: Option.none(),
  twoFactorEnabled: false,
  createdAt: new Date(),
};

const REF = {
  approvalId: "a1",
  action: "user.ban_permanent",
  requesterUserId: "requester",
  userId: "target",
};

const DECISION = {
  approvalId: "a1",
  deciderUserId: "approver",
  deciderPermissions: ["approvals.decide", "users.moderate"] satisfies StaffPermission[],
  decision: "approve" as const,
  note: "checked",
};

const GATE = {
  action: "staff.revoke" as const,
  subjectId: "target",
  params: {},
  requestedBy: "requester",
};

function setup(given: {
  enabled?: boolean;
  actions?: ("staff.role_change" | "staff.revoke" | "user.ban_permanent")[];
  found?: ApprovalRecord;
  claim?: Option<ApprovalRecord>;
  subjectExists?: boolean;
}) {
  const found = Option.fromNullable(given.found ?? PENDING);
  const store = mockPort<IApprovalStore>();
  store.find.mockImplementation(async () => Result.ok(found));
  store.create.mockImplementation(async () => Result.ok(PENDING));
  store.claim.mockImplementation(async () => Result.ok(given.claim ?? found));
  store.cancel.mockImplementation(async () => Result.ok(given.claim ?? found));
  store.markExecuted.mockImplementation(async () => Result.ok(true));
  store.markFailed.mockImplementation(async () => Result.ok(true));
  store.expireDue.mockImplementation(async () => Result.ok([PENDING]));

  const users = mockPort<IAdminUserStore>();
  users.findUserById.mockImplementation(async () =>
    Result.ok(given.subjectExists === false ? Option.none() : Option.some(TARGET)),
  );

  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});
  const uow = mockUnitOfWork();
  const service = new ApprovalService(store, users, outbox, uow.unitOfWork, {
    ADMIN_APPROVAL_ENABLED: given.enabled ?? true,
    ADMIN_APPROVAL_ACTIONS: given.actions ?? ["staff.revoke", "user.ban_permanent"],
    ADMIN_APPROVAL_TTL_HOURS: 72,
  });

  return { service, store, outbox, uow };
}

function runner(result: Result<void, AppError> = Result.ok()) {
  const seen: ApprovedAction[] = [];

  return {
    seen,
    run: async (approved: ApprovedAction) => {
      seen.push(approved);
      return result;
    },
  };
}

describe("ApprovalService.gate", () => {
  it("lets the action through when four-eyes is off", async () => {
    const { service, store, outbox } = setup({ enabled: false });

    const result = await service.gate(GATE);

    expect(result.getValue().isNone()).toBe(true);
    expect(store.create).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("lets through an action the configuration does not list", async () => {
    const { service, store } = setup({ actions: ["staff.role_change"] });

    const result = await service.gate(GATE);

    expect(result.getValue().isNone()).toBe(true);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("stores a listed action as pending and announces it", async () => {
    const { service, store, outbox, uow } = setup({});

    const result = await service.gate(GATE);

    expect(result.getValue().unwrap()).toBe("a1");
    expect(store.create.mock.calls[0]?.[0]).toMatchObject({ ...GATE, ttlHours: 72 });
    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.ADMIN_APPROVAL_REQUESTED,
      payload: { ...REF, actorUserId: "requester" },
    });
    expect(uow.outcome()).toBe("committed");
  });

  it("refuses a request about oneself, a colleague would change the requester's own access", async () => {
    const { service, store } = setup({});

    const result = await service.gate({ ...GATE, subjectId: "requester" });

    expect(result.getError().code).toBe("ADMIN_APPROVAL_SELF_SUBJECT_FORBIDDEN");
    expect(store.create).not.toHaveBeenCalled();
  });

  it("refuses a request about an account that does not exist", async () => {
    const { service, store } = setup({ subjectExists: false });

    const result = await service.gate(GATE);

    expect(result.getError().code).toBe("ADMIN_USER_NOT_FOUND");
    expect(store.create).not.toHaveBeenCalled();
  });
});

describe("ApprovalService.decide", () => {
  it("runs the action, marks it executed and names the approver as actor", async () => {
    const { service, store, outbox, uow } = setup({});
    const action = runner();

    const result = await service.decide(DECISION, action.run);

    expect(result.isSuccess).toBe(true);
    expect(action.seen).toEqual([
      { action: "user.ban_permanent", subjectId: "target", params: { reason: "spam" } },
    ]);
    expect(store.markExecuted).toHaveBeenCalledWith("a1", 0);
    expect(enqueuedEvents(outbox).map((e) => [e.eventType, e.payload])).toEqual([
      [
        EventTypes.ADMIN_APPROVAL_DECIDED,
        { ...REF, actorUserId: "approver", outcome: "approved", note: "checked" },
      ],
      [EventTypes.ADMIN_APPROVAL_EXECUTED, { ...REF, actorUserId: "approver" }],
    ]);
    expect(uow.outcome()).toBe("committed");
  });

  it("refuses the requester deciding their own request", async () => {
    const { service, store } = setup({});
    const action = runner();

    const result = await service.decide({ ...DECISION, deciderUserId: "requester" }, action.run);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_SELF_DECISION_FORBIDDEN");
    expect(store.claim).not.toHaveBeenCalled();
    expect(action.seen).toEqual([]);
  });

  it("refuses an approver who lost the permission of the action", async () => {
    const { service, store, outbox } = setup({});
    const action = runner();

    const result = await service.decide(
      { ...DECISION, deciderPermissions: ["approvals.decide"] },
      action.run,
    );

    expect(result.getError().code).toBe("ADMIN_APPROVAL_PERMISSION_FORBIDDEN");
    expect(store.claim).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("refuses a request whose time ran out, before the sweep passes", async () => {
    const { service, store } = setup({
      found: { ...PENDING, expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await service.decide(DECISION, runner().run);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_EXPIRED_CONFLICT");
    expect(store.claim).not.toHaveBeenCalled();
  });

  it("answers that someone else decided when the claim is lost, and marks nothing failed", async () => {
    const { service, store } = setup({ claim: Option.none() });
    const action = runner();

    const result = await service.decide(DECISION, action.run);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_DECIDED_CONFLICT");
    expect(action.seen).toEqual([]);
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("rolls back a refused action, then records the failure in a second unit", async () => {
    const { service, store, outbox, uow } = setup({});
    const refusal: AppError = {
      code: "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN",
      message: "The last manager cannot lose access.",
    };

    const result = await service.decide(DECISION, runner(Result.fail(refusal)).run);

    expect(result.getError().code).toBe("ADMIN_STAFF_LAST_MANAGER_FORBIDDEN");
    expect(store.markExecuted).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith({
      id: "a1",
      decidedBy: "approver",
      note: "checked",
      reason: "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN",
    });
    expect(uow.outcome()).toBe("committed");
    expect(enqueuedEvents(outbox).at(-1)?.eventType).toBe(EventTypes.ADMIN_APPROVAL_FAILED);
  });

  it("does not run params that no longer pass the route's validation", async () => {
    const { service, store } = setup({ found: { ...PENDING, params: { reason: "" } } });
    const action = runner();

    const result = await service.decide(DECISION, action.run);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_PARAMS_INVALID");
    expect(action.seen).toEqual([]);
    expect(store.markFailed.mock.calls[0]?.[0].reason).toBe("ADMIN_APPROVAL_PARAMS_INVALID");
  });

  it("runs nothing on a rejection", async () => {
    const { service, store, outbox } = setup({});
    const action = runner();

    const result = await service.decide({ ...DECISION, decision: "reject" }, action.run);

    expect(result.isSuccess).toBe(true);
    expect(action.seen).toEqual([]);
    expect(store.claim.mock.calls[0]?.[0]).toMatchObject({ status: "rejected" });
    expect(store.markExecuted).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)[0]?.payload).toMatchObject({ outcome: "rejected" });
  });
});

describe("ApprovalService.cancel", () => {
  it("lets the requester withdraw and announces it", async () => {
    const { service, outbox } = setup({});

    const result = await service.cancel({ approvalId: "a1", userId: "requester" });

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.ADMIN_APPROVAL_CANCELLED,
      payload: { ...REF, actorUserId: "requester" },
    });
  });

  it("hides a colleague's request behind not found", async () => {
    const { service, store } = setup({});

    const result = await service.cancel({ approvalId: "a1", userId: "someone" });

    expect(result.getError().code).toBe("ADMIN_APPROVAL_NOT_FOUND");
    expect(store.cancel).not.toHaveBeenCalled();
  });

  it("refuses to withdraw a request already decided", async () => {
    const { service } = setup({ found: { ...PENDING, status: "executed" } });

    const result = await service.cancel({ approvalId: "a1", userId: "requester" });

    expect(result.getError().code).toBe("ADMIN_APPROVAL_DECIDED_CONFLICT");
  });
});

describe("ApprovalService.expireDue", () => {
  it("announces each expired request with no actor", async () => {
    const { service, outbox } = setup({});

    const result = await service.expireDue(10);

    expect(result.getValue()).toBe(1);
    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.ADMIN_APPROVAL_EXPIRED,
      payload: { ...REF, actorUserId: null },
    });
  });
});

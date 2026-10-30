import { describe, expect, it, spyOn } from "bun:test";
import type { StaffPermission } from "@packages/access-control";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { enqueuedEvents } from "../../../shared/__TESTS__/enqueued-events";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import type { IStaffStore, StaffRecord } from "../../../shared/ports/staff-store.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type { ApprovalHandlers, ApprovedAction } from "../application/approved-action";
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
  requesterPermissions: ["staff.manage"] satisfies StaffPermission[],
};

const REQUESTER_ROW: StaffRecord = {
  userId: "requester",
  role: "manager",
  source: "console",
  banned: false,
  overrides: [],
};

function setup(given: {
  enabled?: boolean;
  actions?: ("staff.role_change" | "staff.revoke" | "user.ban_permanent")[];
  found?: ApprovalRecord;
  claim?: Option<ApprovalRecord>;
  subjectExists?: boolean;
  created?: boolean;
  requester?: Option<StaffRecord>;
  prepared?: Result<never, AppError>;
  authorized?: Result<void, AppError>;
  executed?: Result<void, AppError>;
  failureBreaks?: "result" | "throw";
}) {
  const found = Option.fromNullable(given.found ?? PENDING);
  const store = mockPort<IApprovalStore>();
  store.find.mockImplementation(async () => Result.ok(found));
  store.create.mockImplementation(async () =>
    Result.ok({ record: PENDING, created: given.created ?? true }),
  );
  store.expireDueFor.mockImplementation(async () => Result.ok([]));
  store.claim.mockImplementation(async () => Result.ok(given.claim ?? found));
  store.cancel.mockImplementation(async () => Result.ok(given.claim ?? found));
  store.markExecuted.mockImplementation(async () => Result.ok(true));
  store.markFailed.mockImplementation(async () => {
    if (given.failureBreaks === "throw") throw new Error("connection lost");

    return given.failureBreaks === "result"
      ? Result.fail({ code: "ADMIN_APPROVAL_PROVIDER_FAILURE", message: "down" })
      : Result.ok(true);
  });
  store.expireDue.mockImplementation(async () => Result.ok([PENDING]));

  const users = mockPort<IAdminUserStore>();
  users.findUserById.mockImplementation(async () =>
    Result.ok(given.subjectExists === false ? Option.none() : Option.some(TARGET)),
  );

  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});
  const uow = mockUnitOfWork();
  const staff = mockPort<IStaffStore>();
  staff.findActive.mockImplementation(async () =>
    Result.ok(given.requester ?? Option.some(REQUESTER_ROW)),
  );

  const seen: ApprovedAction[] = [];
  const handler = {
    prepare: async <P>(request: { params: P }) => given.prepared ?? Result.ok(request.params),
    authorize: async () => given.authorized ?? Result.ok(),
    run: async (approved: ApprovedAction) => {
      seen.push(approved);

      return given.executed ?? Result.ok();
    },
  };
  const handlers: ApprovalHandlers = {
    "user.ban_permanent": handler,
    "staff.role_change": {
      ...handler,
      prepare: async ({ params }) =>
        given.prepared ?? Result.ok({ role: params.role, fromRole: "support" }),
    },
    "staff.revoke": handler,
    "staff.permission_override": handler,
  };

  const instrumentation = new NoOpInstrumentation();
  const capture = spyOn(instrumentation, "capture");
  const service = new ApprovalService(
    store,
    users,
    staff,
    outbox,
    uow.unitOfWork,
    instrumentation,
    handlers,
    {
      ADMIN_APPROVAL_ENABLED: given.enabled ?? true,
      ADMIN_APPROVAL_ACTIONS: given.actions ?? ["staff.revoke", "user.ban_permanent"],
      ADMIN_APPROVAL_TTL_HOURS: 72,
      PLATFORM_ADMIN_IDS: [],
      PLATFORM_ADMIN_REQUIRE_MFA: false,
    },
  );

  return { service, store, outbox, uow, seen, capture };
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
    expect(store.create.mock.calls[0]?.[0]).toMatchObject({
      action: GATE.action,
      subjectId: GATE.subjectId,
      requestedBy: GATE.requestedBy,
      ttlHours: 72,
    });
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

  it("queues nothing the requester could not do themselves", async () => {
    const refusal: AppError = { code: "ADMIN_USER_STAFF_TARGET_FORBIDDEN", message: "no" };
    const { service, store, outbox } = setup({ prepared: Result.fail(refusal) });

    const result = await service.gate(GATE);

    expect(result.getError().code).toBe("ADMIN_USER_STAFF_TARGET_FORBIDDEN");
    expect(store.create).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("stores what the action prepared, so a role change remembers the role it starts from", async () => {
    const { service, store } = setup({ actions: ["staff.role_change"] });

    await service.gate({
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
    const { service, outbox } = setup({ created: false });

    const result = await service.gate(GATE);

    expect(result.getValue().unwrap()).toBe("a1");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("closes an overdue request on the same pair instead of answering with a dead one", async () => {
    const { service, store, outbox } = setup({});
    store.expireDueFor.mockImplementation(async () => Result.ok([PENDING]));

    await service.gate(GATE);

    expect(enqueuedEvents(outbox).map((e) => e.eventType)).toEqual([
      EventTypes.ADMIN_APPROVAL_EXPIRED,
      EventTypes.ADMIN_APPROVAL_REQUESTED,
    ]);
  });
});

describe("ApprovalService.decide", () => {
  it("runs the action, marks it executed and names the approver as actor", async () => {
    const { service, store, outbox, uow, seen } = setup({});

    const result = await service.decide(DECISION);

    expect(result.isSuccess).toBe(true);
    expect(seen).toEqual([
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
    const { service, store, seen } = setup({});

    const result = await service.decide({ ...DECISION, deciderUserId: "requester" });

    expect(result.getError().code).toBe("ADMIN_APPROVAL_SELF_DECISION_FORBIDDEN");
    expect(store.claim).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it("refuses the subject deciding a request about themselves, approving or rejecting", async () => {
    for (const decision of ["approve", "reject"] as const) {
      const { service, store } = setup({});

      const result = await service.decide({ ...DECISION, deciderUserId: "target", decision });

      expect(result.getError().code).toBe("ADMIN_APPROVAL_SUBJECT_DECISION_FORBIDDEN");
      expect(store.claim).not.toHaveBeenCalled();
    }
  });

  it("leaves the request pending when the approver lacks the power over this target", async () => {
    const refusal: AppError = { code: "ADMIN_USER_STAFF_TARGET_FORBIDDEN", message: "no" };
    const { service, store, seen } = setup({ authorized: Result.fail(refusal) });

    const result = await service.decide(DECISION);

    expect(result.getError().code).toBe("ADMIN_USER_STAFF_TARGET_FORBIDDEN");
    expect(store.claim).not.toHaveBeenCalled();
    expect(store.markFailed).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it("closes as failed a request whose requester no longer holds the action", async () => {
    const { service, store, seen, outbox } = setup({
      requester: Option.some({ ...REQUESTER_ROW, role: "auditor" }),
    });

    const result = await service.decide(DECISION);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT");
    expect(seen).toEqual([]);
    expect(store.claim).not.toHaveBeenCalled();
    expect(store.markFailed.mock.calls[0]?.[0].reason).toBe(
      "ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT",
    );
    expect(enqueuedEvents(outbox).at(-1)?.eventType).toBe(EventTypes.ADMIN_APPROVAL_FAILED);
  });

  it("keeps the business code and tells telemetry when recording the failure breaks", async () => {
    const refusal: AppError = { code: "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN", message: "no" };

    for (const failureBreaks of ["result", "throw"] as const) {
      const { service, capture } = setup({ executed: Result.fail(refusal), failureBreaks });

      const result = await service.decide(DECISION);

      expect(result.getError().code).toBe("ADMIN_STAFF_LAST_MANAGER_FORBIDDEN");
      expect(capture).toHaveBeenCalledTimes(1);
    }
  });

  it("refuses an approver who lost the permission of the action", async () => {
    const { service, store, outbox } = setup({});

    const result = await service.decide({ ...DECISION, deciderPermissions: ["approvals.decide"] });

    expect(result.getError().code).toBe("ADMIN_APPROVAL_PERMISSION_FORBIDDEN");
    expect(store.claim).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("refuses a request whose time ran out, before the sweep passes", async () => {
    const { service, store } = setup({
      found: { ...PENDING, expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await service.decide(DECISION);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_EXPIRED_CONFLICT");
    expect(store.claim).not.toHaveBeenCalled();
  });

  it("answers that someone else decided when the claim is lost, and marks nothing failed", async () => {
    const { service, store, seen } = setup({ claim: Option.none() });

    const result = await service.decide(DECISION);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_DECIDED_CONFLICT");
    expect(seen).toEqual([]);
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it("rolls back a refused action, then records the failure in a second unit", async () => {
    const refusal: AppError = {
      code: "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN",
      message: "The last manager cannot lose access.",
    };
    const { service, store, outbox, uow } = setup({ executed: Result.fail(refusal) });

    const result = await service.decide(DECISION);

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
    const { service, store, seen } = setup({ found: { ...PENDING, params: { reason: "" } } });

    const result = await service.decide(DECISION);

    expect(result.getError().code).toBe("ADMIN_APPROVAL_PARAMS_INVALID");
    expect(seen).toEqual([]);
    expect(store.markFailed.mock.calls[0]?.[0].reason).toBe("ADMIN_APPROVAL_PARAMS_INVALID");
  });

  it("runs nothing on a rejection", async () => {
    const { service, store, outbox, seen } = setup({});

    const result = await service.decide({ ...DECISION, decision: "reject" });

    expect(result.isSuccess).toBe(true);
    expect(seen).toEqual([]);
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

describe("ApprovalService.closeForDeletedUser", () => {
  it("cancels the open requests with an event that names no actor", async () => {
    const { service, store, outbox } = setup({});
    store.closeForDeletedUser.mockImplementation(async () => Result.ok([PENDING]));

    const result = await service.closeForDeletedUser("target");

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.ADMIN_APPROVAL_CANCELLED,
      payload: { ...REF, actorUserId: null },
    });
  });
});

describe("ApprovalService.list", () => {
  it("offers a cursor on a full page that carries both keys, none on a short one", async () => {
    const { service, store } = setup({});
    store.list.mockImplementation(async () => Result.ok([PENDING]));

    const full = await service.list({ limit: 1 });
    const short = await service.list({ limit: 2 });

    expect(full.getValue().nextCursor.unwrap()).toBe(`${PENDING.createdAt.toISOString()}~a1`);
    expect(short.getValue().nextCursor.isNone()).toBe(true);
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

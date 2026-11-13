import type { StaffPermission } from "@packages/access-control";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { ApprovalHandlers, ApprovedAction } from "../../application/approved-action";
import type {
  AdminUserRow,
  IAdminUserStore,
} from "../../application/ports/repositories/admin-user-store.port";
import type {
  ApprovalRecord,
  IApprovalStore,
} from "../../application/ports/repositories/approval-store.port";
import type {
  IStaffStore,
  StaffRecord,
} from "../../application/ports/repositories/staff-store.port";
import { ApprovalService } from "../../application/services/approval.service";
import { CancelApprovalUseCase } from "../../application/usecases/cancel-approval/cancel-approval.usecase";
import { CloseApprovalsOfDeletedUserUseCase } from "../../application/usecases/close-approvals-of-deleted-user/close-approvals-of-deleted-user.usecase";
import { DecideApprovalUseCase } from "../../application/usecases/decide-approval/decide-approval.usecase";
import { ExpireApprovalsUseCase } from "../../application/usecases/expire-approvals/expire-approvals.usecase";

export const PENDING: ApprovalRecord = {
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

export const REF = {
  approvalId: "a1",
  action: "user.ban_permanent",
  requesterUserId: "requester",
  userId: "target",
};

export const REQUESTER_ROW: StaffRecord = {
  userId: "requester",
  role: "manager",
  source: "console",
  banned: false,
  overrides: [],
};

export const DECIDER_PERMISSIONS: StaffPermission[] = ["approvals.decide", "users.moderate"];

export interface ApprovalGiven {
  enabled?: boolean;
  actions?: ("staff.role_change" | "staff.revoke" | "user.ban_permanent")[];
  found?: ApprovalRecord;
  claim?: Option<ApprovalRecord>;
  subjectExists?: boolean;
  created?: boolean;
  open?: ApprovalRecord;
  requester?: Option<StaffRecord>;
  prepared?: Result<never, AppError>;
  authorized?: Result<void, AppError>;
  executed?: Result<void, AppError>;
  failureBreaks?: "result" | "throw";
}

export function approvalSetup(given: ApprovalGiven = {}) {
  const found = Option.fromNullable(given.found ?? PENDING);
  const store = mockPort<IApprovalStore>();
  store.find.mockImplementation(async () => Result.ok(found));
  store.create.mockImplementation(async () =>
    Result.ok({ record: given.open ?? PENDING, created: given.created ?? true }),
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
    "staff.permission_override": {
      ...handler,
      prepare: async () =>
        given.prepared ??
        Result.ok({ op: "set", permission: "users.read", effect: "grant", expiresAt: null }),
    },
  };

  const instrumentation = mockInstrumentation();
  const settings = {
    approvalEnabled: given.enabled ?? true,
    approvalActions: given.actions ?? ["staff.revoke", "user.ban_permanent"],
    approvalTtlHours: 72,
  };

  return {
    store,
    uow,
    seen,
    capture: instrumentation.capture,
    approvals: new ApprovalService(store, users, uow.unitOfWork, handlers, settings),
    decide: new DecideApprovalUseCase(store, staff, uow.unitOfWork, instrumentation, handlers, {
      PLATFORM_ADMIN_IDS: [],
      PLATFORM_ADMIN_REQUIRE_MFA: false,
    }),
    cancel: new CancelApprovalUseCase(store, uow.unitOfWork),
    expire: new ExpireApprovalsUseCase(store, uow.unitOfWork),
    closeForDeletedUser: new CloseApprovalsOfDeletedUserUseCase(store, uow.unitOfWork),
  };
}

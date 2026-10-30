import { beforeEach, describe, expect, it, mock } from "bun:test";
import { type IUnitOfWork, Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import { enqueuedEvents } from "../../../shared/__TESTS__/enqueued-events";
import type { EmailError, IEmailService } from "../../../shared/ports/email.port";
import type { IInstrumentation } from "../../../shared/ports/instrumentation.port";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import type {
  IStaffStore,
  StaffManagerRecord,
  StaffRecord,
} from "../../../shared/ports/staff-store.port";
import type { IStorageService } from "../../../shared/ports/storage.port";
import type { ITotpVerifier } from "../../../shared/ports/totp-verifier.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type {
  ExecuteWipeOutput,
  IRgpdRepository,
  PendingDeletionRow,
  RgpdError,
  SoleOwnedOrgWithMembers,
  UserDeletionState,
  UserExportPayload,
} from "../application/ports/rgpd.port";
import { RgpdService } from "../application/services/rgpd.service";

const baseState: UserDeletionState = {
  email: "u@example.com",
  name: "User",
  locale: Option.some("fr"),
  twoFactorEnabled: false,
  pendingDeletionUntil: Option.none(),
  deletedAt: Option.none(),
  lastExportRequestedAt: Option.none(),
};

const stubExportPayload: UserExportPayload = {
  exportedAt: new Date().toISOString(),
  user: {
    id: "u1",
    name: "User",
    email: "u@example.com",
    emailVerified: true,
    image: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    twoFactorEnabled: false,
  },
  sessions: [],
  memberships: [],
  invitationsSent: [],
};

let uow: UnitOfWorkMock = mockUnitOfWork();

function throwingUnitOfWork(message: string): IUnitOfWork {
  const { unitOfWork } = mockUnitOfWork();
  unitOfWork.run.mockImplementation(async () => {
    throw new Error(message);
  });
  return unitOfWork;
}

function graceElapsedStateFor(userId: string): UserDeletionState {
  return {
    ...baseState,
    email: `${userId}@example.com`,
    pendingDeletionUntil: Option.some(new Date(Date.now() - 1000)),
  };
}

function makeRepo(overrides: Partial<IRgpdRepository> = {}): IRgpdRepository {
  return {
    findSoleOwnedNonPersonalOrgsWithMembers: mock(async () => Result.ok<never[], RgpdError>([])),
    collectUserDataForExport: mock(async () =>
      Result.ok<UserExportPayload, RgpdError>(stubExportPayload),
    ),
    markPendingDeletion: mock(async () => Result.ok<RgpdError>()),
    clearPendingDeletion: mock(async () => Result.ok<RgpdError>()),
    findUsersReadyForWipe: mock(async () => Result.ok<PendingDeletionRow[], RgpdError>([])),
    executeWipe: mock(async () =>
      Result.ok<ExecuteWipeOutput, RgpdError>({
        deletedOrgIds: ["org_personal", "org_solo"],
        anonymizedEmail: "deleted-uuid@anonymized.local",
        alreadyWiped: false,
      }),
    ),
    verifyPassword: mock(async () => Result.ok<boolean, RgpdError>(true)),
    touchExportRequestedAt: mock(async () => Result.ok<RgpdError>()),
    getUserDeletionState: mock(async () =>
      Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(baseState)),
    ),
    ...overrides,
  } as unknown as IRgpdRepository;
}

function makeStorage(overrides: Partial<IStorageService> = {}): IStorageService {
  return {
    presignUpload: mock(async () => Result.ok({ url: "", expiresAt: "" })),
    presignDownload: mock(async () =>
      Result.ok({ url: "https://cdn.example.com/export.json", expiresAt: "2099-01-01T00:00:00Z" }),
    ),
    headObject: mock(async () => Result.ok({ size: 0, contentType: "" })),
    deleteObject: mock(async () => Result.ok<RgpdError>()),
    uploadObject: mock(async () => Result.ok<RgpdError>()),
    listObjectKeys: mock(async () => Result.ok(["u1/uploads/a", "u1/exports/b"])),
    deleteObjects: mock(async () => Result.ok<RgpdError>()),
    publicUrlFor: mock(() => ""),
    ...overrides,
  } as unknown as IStorageService;
}

function makeEmail(): IEmailService {
  return {
    sendTemplate: mock(async () => Result.ok<RgpdError>()),
    sendTemplateBatch: mock(async () => Result.ok<RgpdError>()),
    sendRaw: mock(async () => Result.ok<RgpdError>()),
    sendRawBatch: mock(async () => Result.ok<RgpdError>()),
  } as unknown as IEmailService;
}

function buildService(deps: {
  repo: IRgpdRepository;
  email: IEmailService;
  storage?: IStorageService;
  uow?: IUnitOfWork;
  outbox?: IOutboxRepository;
  instrumentation?: IInstrumentation;
  staff?: IStaffStore;
  listed?: string[];
  totp?: ITotpVerifier;
}): RgpdService {
  return new RgpdService(
    deps.repo,
    deps.storage ?? makeStorage(),
    deps.email,
    deps.uow ?? uow.unitOfWork,
    deps.outbox ?? mockPort<IOutboxRepository>(),
    deps.instrumentation ?? new NoOpInstrumentation(),
    deps.staff ?? makeStaff(Option.none(), []),
    { PLATFORM_ADMIN_IDS: deps.listed ?? [] },
    deps.totp ?? acceptingTotp(),
  );
}

function acceptingTotp() {
  const totp = mockPort<ITotpVerifier>();
  totp.verify.mockImplementation(async () => Result.ok(Option.some(1)));

  return totp;
}

function makeStaff(row: Option<StaffRecord>, managers: StaffManagerRecord[]) {
  const staff = mockPort<IStaffStore>();
  staff.findActive.mockImplementation(async () => Result.ok(row));
  staff.lockActiveManagers.mockImplementation(async () => Result.ok(managers));
  staff.revoke.mockImplementation(async () => Result.ok());

  return staff;
}

function makeService(opts: {
  email?: IEmailService;
  readyForWipe?: string[];
  wipeFails?: boolean;
}): RgpdService {
  const rows: PendingDeletionRow[] = (opts.readyForWipe ?? []).map((userId) => ({
    userId,
    email: `${userId}@example.com`,
    pendingDeletionUntil: new Date(Date.now() - 1000),
  }));
  const repo = makeRepo({
    findUsersReadyForWipe: mock(async () => Result.ok<PendingDeletionRow[], RgpdError>(rows)),
    getUserDeletionState: opts.wipeFails
      ? mock(async () => Result.ok<Option<UserDeletionState>, RgpdError>(Option.none()))
      : mock(async (userId: string) =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some(graceElapsedStateFor(userId)),
          ),
        ),
  });
  return buildService({ repo, email: opts.email ?? makeEmail() });
}

describe("RgpdService", () => {
  let email: IEmailService;

  beforeEach(() => {
    email = makeEmail();
    uow = mockUnitOfWork();
  });

  describe("preflightAccountDeletion", () => {
    it("returns an empty blockingOrgs list when user has no blocking orgs", async () => {
      const repo = makeRepo();
      const service = buildService({ repo, email });

      const result = await service.preflightAccountDeletion({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().blockingOrgs).toEqual([]);
    });

    it("returns blocking orgs when user is sole owner of non-personal orgs with other members", async () => {
      const blocking: SoleOwnedOrgWithMembers[] = [
        { orgId: "org_1", orgName: "Acme", otherMembersCount: 3 },
        { orgId: "org_2", orgName: "Beta", otherMembersCount: 1 },
      ];
      const repo = makeRepo({
        findSoleOwnedNonPersonalOrgsWithMembers: mock(async () =>
          Result.ok<SoleOwnedOrgWithMembers[], RgpdError>(blocking),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.preflightAccountDeletion({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().blockingOrgs).toEqual(blocking);
    });
  });

  describe("requestAccountDeletion", () => {
    it("returns ACCOUNT_DELETION_BLOCKED when sole-owner of non-personal orgs with members", async () => {
      const repo = makeRepo({
        findSoleOwnedNonPersonalOrgsWithMembers: mock(async () =>
          Result.ok<SoleOwnedOrgWithMembers[], RgpdError>([
            { orgId: "org_1", orgName: "Acme", otherMembersCount: 3 },
          ]),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.requestAccountDeletion({ userId: "u1", password: "secret" });

      expect(result.isFailure).toBe(true);
      const err = result.getError();
      expect(err.code).toBe("ACCOUNT_DELETION_BLOCKED");
      expect(err.metadata?.offendingOrgs).toEqual([
        { orgId: "org_1", orgName: "Acme", otherMembersCount: 3 },
      ]);
    });

    it("returns ACCOUNT_PASSWORD_INVALID on bad password", async () => {
      const repo = makeRepo({
        verifyPassword: mock(async () => Result.ok<boolean, RgpdError>(false)),
      });
      const service = buildService({ repo, email });

      const result = await service.requestAccountDeletion({ userId: "u1", password: "wrong" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_PASSWORD_INVALID");
    });

    it("marks pending and emails when password is valid and 2FA disabled", async () => {
      const repo = makeRepo();
      const service = buildService({ repo, email });

      const result = await service.requestAccountDeletion({ userId: "u1", password: "good" });

      expect(result.isSuccess).toBe(true);
      expect(repo.markPendingDeletion).toHaveBeenCalled();
      expect(email.sendTemplate).toHaveBeenCalledWith(
        "delete_requested",
        "u@example.com",
        expect.objectContaining({ name: "User", cancelUrl: expect.any(String) }),
        expect.objectContaining({ idempotencyKey: expect.any(String), locale: "fr" }),
      );
    });

    it("returns TWO_FACTOR_REQUIRED when 2FA enabled and no totpCode given", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some({ ...baseState, twoFactorEnabled: true }),
          ),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.requestAccountDeletion({ userId: "u1", password: "ignored" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("TWO_FACTOR_REQUIRED");
    });

    it("returns TWO_FACTOR_INVALID when TOTP code is invalid", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some({ ...baseState, twoFactorEnabled: true }),
          ),
        ),
      });
      const totp = mockPort<ITotpVerifier>();
      totp.verify.mockImplementation(async () => Result.ok(Option.none()));
      const service = buildService({ repo, email, totp });

      const result = await service.requestAccountDeletion({ userId: "u1", totpCode: "000000" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("TWO_FACTOR_INVALID");
    });

    it("returns existing pendingDeletionUntil when already pending without re-marking", async () => {
      const existing = new Date(Date.now() + 86400000);
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some({ ...baseState, pendingDeletionUntil: Option.some(existing) }),
          ),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.requestAccountDeletion({ userId: "u1", password: "anything" });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().pendingDeletionUntil).toBe(existing.toISOString());
      expect(repo.markPendingDeletion).not.toHaveBeenCalled();
    });
  });

  describe("cancelAccountDeletion", () => {
    it("clears the pending column and emails when a deletion is pending", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some({
              ...baseState,
              pendingDeletionUntil: Option.some(new Date(Date.now() + 86400000)),
            }),
          ),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.cancelAccountDeletion({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(repo.clearPendingDeletion).toHaveBeenCalledWith("u1");
      expect(email.sendTemplate).toHaveBeenCalledWith(
        "delete_cancelled",
        "u@example.com",
        expect.objectContaining({ name: "User" }),
        expect.objectContaining({ idempotencyKey: expect.any(String), locale: "fr" }),
      );
    });

    it("returns ACCOUNT_DELETION_NOT_FOUND when nothing is pending", async () => {
      const repo = makeRepo();
      const service = buildService({ repo, email });

      const result = await service.cancelAccountDeletion({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
      expect(repo.clearPendingDeletion).not.toHaveBeenCalled();
    });
  });

  describe("requestAccountDeletion by staff", () => {
    const managerRow = Option.some<StaffRecord>({
      userId: "u1",
      role: "manager",
      source: "console",
      banned: false,
      overrides: [],
    });
    const request = { userId: "u1", password: "pw" };

    it("refuses the last manager with an actionable error and marks nothing", async () => {
      const repo = makeRepo();
      const service = buildService({
        repo,
        email,
        staff: makeStaff(managerRow, [{ userId: "u1", source: "console" }]),
      });

      const result = await service.requestAccountDeletion(request);

      expect(result.getError().code).toBe("ACCOUNT_DELETION_LAST_MANAGER_FORBIDDEN");
      expect(repo.markPendingDeletion).not.toHaveBeenCalled();
    });

    it("lets a manager go when another one remains", async () => {
      const repo = makeRepo();
      const service = buildService({
        repo,
        email,
        staff: makeStaff(managerRow, [
          { userId: "u1", source: "console" },
          { userId: "u2", source: "console" },
        ]),
      });

      expect((await service.requestAccountDeletion(request)).isSuccess).toBe(true);
    });

    it("lets an env-listed last manager go, the env being the recovery", async () => {
      const repo = makeRepo();
      const service = buildService({
        repo,
        email,
        listed: ["u1"],
        staff: makeStaff(managerRow, [{ userId: "u1", source: "console" }]),
      });

      expect((await service.requestAccountDeletion(request)).isSuccess).toBe(true);
    });

    it("lets a support member go without touching the manager lock", async () => {
      const staff = makeStaff(
        Option.some<StaffRecord>({
          userId: "u1",
          role: "support",
          source: "console",
          banned: false,
          overrides: [],
        }),
        [],
      );
      const service = buildService({ repo: makeRepo(), email, staff });

      expect((await service.requestAccountDeletion(request)).isSuccess).toBe(true);
      expect(staff.lockActiveManagers).not.toHaveBeenCalled();
    });
  });

  describe("executeAccountWipe", () => {
    const elapsedState: UserDeletionState = {
      ...baseState,
      pendingDeletionUntil: Option.some(new Date(Date.now() - 1000)),
    };

    it("revokes the staff row of a wiped member and announces it with the member as actor", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
      });
      const staff = makeStaff(
        Option.some<StaffRecord>({
          userId: "u1",
          role: "manager",
          source: "console",
          banned: false,
          overrides: [],
        }),
        [],
      );
      const outbox = mockPort<IOutboxRepository>();
      outbox.enqueue.mockImplementation(async () => {});
      const service = buildService({ repo, email, staff, outbox });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(staff.revoke).toHaveBeenCalledWith("u1");
      expect(
        enqueuedEvents(outbox).filter((e) => e.eventType === EventTypes.ADMIN_STAFF_REVOKED),
      ).toEqual([
        {
          eventType: EventTypes.ADMIN_STAFF_REVOKED,
          aggregateId: "u1",
          payload: { actorUserId: "u1", userId: "u1", role: "manager" },
        },
      ]);
    });

    it("writes nothing on the staff side for a user who is not staff", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
      });
      const staff = makeStaff(Option.none(), []);
      const service = buildService({ repo, email, staff });

      await service.executeAccountWipe({ userId: "u1" });

      expect(staff.revoke).not.toHaveBeenCalled();
    });

    it("rolls the wipe back when the staff revocation fails", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
      });
      const staff = makeStaff(
        Option.some<StaffRecord>({
          userId: "u1",
          role: "support",
          source: "console",
          banned: false,
          overrides: [],
        }),
        [],
      );
      staff.revoke.mockImplementation(async () =>
        Result.fail({ code: "ADMIN_STAFF_PROVIDER_FAILURE", message: "down" }),
      );
      const service = buildService({ repo, email, staff });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.getError().code).toBe("ACCOUNT_WIPE_PROVIDER_FAILURE");
    });

    it("anonymizes via repo, deletes storage prefix, and emails the user", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
      });
      const storage = makeStorage();
      const service = buildService({ repo, email, storage });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(repo.executeWipe).toHaveBeenCalled();
      expect(storage.listObjectKeys).toHaveBeenCalledWith("u1/");
      expect(storage.deleteObjects).toHaveBeenCalledWith(["u1/uploads/a", "u1/exports/b"]);
      expect(result.getValue().storageKeysDeleted).toBe(2);
      expect(email.sendTemplate).toHaveBeenCalledWith(
        "delete_completed",
        "u@example.com",
        { name: "User" },
        expect.objectContaining({ idempotencyKey: "delete-completed/u1", locale: "fr" }),
      );
    });

    it("enqueues the confirmation inside the wipe transaction", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
      });
      const sentInside: boolean[] = [];
      (email.sendTemplate as unknown as ReturnType<typeof mock>).mockImplementation(async () => {
        sentInside.push(UnitOfWorkContext.transaction() !== undefined);
        return Result.ok();
      });
      const service = buildService({ repo, email });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(uow.outcome()).toBe("committed");
      expect(sentInside).toEqual([true]);
      expect(email.sendTemplate).toHaveBeenCalledTimes(1);
      const call = (
        email.sendTemplate as unknown as {
          mock: {
            calls: [string, string, unknown, { idempotencyKey?: string }][];
          };
        }
      ).mock.calls[0];
      if (!call) throw new Error("sendTemplate was not called");
      const [template, to, variables, options] = call;
      expect(template).toBe("delete_completed");
      expect(to).toBe("u@example.com");
      expect(variables).toEqual({ name: "User" });
      expect(options.idempotencyKey).toBe("delete-completed/u1");
    });

    it("aborts the wipe transaction when the confirmation cannot be enqueued", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
      });
      const failEmail: IEmailService = {
        ...makeEmail(),
        sendTemplate: mock(async () =>
          Result.fail<void, EmailError>({ code: "EMAIL_PROVIDER_FAILURE", message: "boom" }),
        ),
      };
      const service = buildService({ repo, email: failEmail });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE");
      expect(uow.outcome()).toBe("rolled_back");
    });

    it("reports a generic provider failure and captures the error when the ROLLBACK itself throws", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
      });
      const failEmail: IEmailService = {
        ...makeEmail(),
        sendTemplate: mock(async () =>
          Result.fail<void, EmailError>({ code: "EMAIL_PROVIDER_FAILURE", message: "boom" }),
        ),
      };
      const brokenTx = throwingUnitOfWork("connection terminated unexpectedly");
      const captured: unknown[] = [];
      const capturingInstrumentation = new NoOpInstrumentation();
      capturingInstrumentation.capture = (err: unknown) => {
        captured.push(err);
      };

      const service = buildService({
        repo,
        email: failEmail,
        uow: brokenTx,
        instrumentation: capturingInstrumentation,
      });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_WIPE_PROVIDER_FAILURE");
      expect(captured).toHaveLength(1);
    });

    it("emits ORG_DELETED for every organization destroyed in the wipe (RGPD audit completeness)", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
      });
      const spyOutbox = mockPort<IOutboxRepository>();
      const service = buildService({ repo, email, outbox: spyOutbox });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(enqueuedEvents(spyOutbox).some((e) => e.eventType === EventTypes.USER_DELETED)).toBe(
        true,
      );
      const orgDeleted = enqueuedEvents(spyOutbox)
        .filter((e) => e.eventType === EventTypes.ORG_DELETED)
        .map((e) => e.aggregateId)
        .sort();
      expect(orgDeleted).toEqual(["org_personal", "org_solo"]);
    });

    it("short-circuits without emitting USER_DELETED when the repository reports the row already wiped (lost race, no SKIP LOCKED on rgpd-sweep)", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
        executeWipe: mock(async () =>
          Result.ok<ExecuteWipeOutput, RgpdError>({
            deletedOrgIds: [],
            anonymizedEmail: "",
            alreadyWiped: true,
          }),
        ),
      });
      const spyOutbox = mockPort<IOutboxRepository>();
      const service = buildService({ repo, email, outbox: spyOutbox });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(enqueuedEvents(spyOutbox)).toHaveLength(0);
    });

    it("returns success no-op when user is already deleted", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some({
              email: "deleted@anonymized.local",
              locale: Option.none<"fr">(),
              name: "[deleted]",
              twoFactorEnabled: false,
              pendingDeletionUntil: Option.none(),
              deletedAt: Option.some(new Date()),
              lastExportRequestedAt: Option.none(),
            }),
          ),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().storageKeysDeleted).toBe(0);
      expect(repo.executeWipe).not.toHaveBeenCalled();
    });

    it("rejects when grace has not elapsed yet", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some({
              ...baseState,
              pendingDeletionUntil: Option.some(new Date(Date.now() + 86400000)),
            }),
          ),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
      expect(repo.executeWipe).not.toHaveBeenCalled();
    });

    it("does not throw when storage cleanup fails because the wipe is already committed", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.some(elapsedState)),
        ),
      });
      const storage = makeStorage({
        listObjectKeys: mock(async () =>
          Result.fail({ code: "STORAGE_PROVIDER_FAILURE" as const, message: "boom" }),
        ) as IStorageService["listObjectKeys"],
      });
      const service = buildService({ repo, email, storage });

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().storageKeysDeleted).toBe(0);
    });
  });

  describe("processPendingDeletions", () => {
    const pendingRows: PendingDeletionRow[] = [
      { userId: "u1", email: "u1@example.com", pendingDeletionUntil: new Date(Date.now() - 1000) },
      { userId: "u2", email: "u2@example.com", pendingDeletionUntil: new Date(Date.now() - 1000) },
      { userId: "u3", email: "u3@example.com", pendingDeletionUntil: new Date(Date.now() - 1000) },
    ];

    function makeBatchRepo(
      rows: PendingDeletionRow[],
      overrides: Partial<IRgpdRepository> = {},
    ): IRgpdRepository {
      return makeRepo({
        findUsersReadyForWipe: mock(async () => Result.ok<PendingDeletionRow[], RgpdError>(rows)),
        getUserDeletionState: mock(async (userId: string) =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some(graceElapsedStateFor(userId)),
          ),
        ),
        ...overrides,
      });
    }

    it("returns the pending list without calling wipe in dryRun mode", async () => {
      const repo = makeBatchRepo(pendingRows);
      const service = buildService({ repo, email });

      const result = await service.processPendingDeletions({ batchSize: 50, dryRun: true });

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.dryRun).toBe(true);
      expect(output.processed).toBe(3);
      expect(output.succeeded).toEqual(["u1", "u2", "u3"]);
      expect(output.failed).toEqual([]);
      expect(repo.executeWipe).not.toHaveBeenCalled();
    });

    it("only requests up to batchSize rows from the repo", async () => {
      const repo = makeBatchRepo(pendingRows.slice(0, 2), {
        findUsersReadyForWipe: mock(async (limit: number) =>
          Result.ok<PendingDeletionRow[], RgpdError>(pendingRows.slice(0, limit)),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.processPendingDeletions({ batchSize: 2 });

      expect(result.isSuccess).toBe(true);
      expect(repo.findUsersReadyForWipe).toHaveBeenCalledWith(2);
      expect(result.getValue().processed).toBe(2);
    });

    it("processes all rows and reports successes (happy path)", async () => {
      const repo = makeBatchRepo(pendingRows);
      const service = buildService({ repo, email });

      const result = await service.processPendingDeletions({});

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.dryRun).toBe(false);
      expect(output.processed).toBe(3);
      expect(output.succeeded).toHaveLength(3);
      expect(output.failed).toHaveLength(0);
    });

    it("aggregates failures without throwing while other users are still processed", async () => {
      const repo = makeBatchRepo(pendingRows, {
        getUserDeletionState: mock(async (userId: string) => {
          if (userId === "u2") {
            return Result.ok<Option<UserDeletionState>, RgpdError>(Option.none());
          }
          return Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some(graceElapsedStateFor(userId)),
          );
        }),
      });
      const service = buildService({ repo, email });

      const result = await service.processPendingDeletions({});

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.processed).toBe(3);
      expect(output.succeeded).toContain("u1");
      expect(output.succeeded).toContain("u3");
      expect(output.failed.some((f) => f.userId === "u2")).toBe(true);
    });

    it("sends one enqueue per account rather than one batch", async () => {
      const emailMock = makeEmail();
      const service = makeService({ email: emailMock, readyForWipe: ["u1", "u2", "u3"] });

      const result = await service.processPendingDeletions({ batchSize: 50 });

      expect(result.getValue().succeeded).toHaveLength(3);
      expect(emailMock.sendTemplate).toHaveBeenCalledTimes(3);
      expect(emailMock.sendTemplateBatch).not.toHaveBeenCalled();
    });

    it("does not send anything when every wipe fails", async () => {
      const emailMock = makeEmail();
      const service = makeService({ email: emailMock, readyForWipe: ["u1"], wipeFails: true });

      await service.processPendingDeletions({ batchSize: 50 });

      expect(emailMock.sendTemplate).not.toHaveBeenCalled();
      expect(emailMock.sendTemplateBatch).not.toHaveBeenCalled();
    });

    it("stops between wipes once the budget is spent and reports truncated", async () => {
      // A clock that jumps 60ms per read: deadlineAt = 60 + 100 = 160. The first
      // in-loop check reads 120 (< 160, wipe runs); the second reads 180 (>= 160,
      // stop before starting the next wipe): one account wiped, two deferred.
      let readCount = 0;
      const fakeClock = () => {
        readCount += 1;
        return readCount * 60;
      };
      const repo = makeBatchRepo(pendingRows);
      const service = buildService({ repo, email });

      const result = await service.processPendingDeletions({
        batchSize: 3,
        dryRun: false,
        deadlineMs: 100,
        now: fakeClock,
      });

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.succeeded).toHaveLength(1);
      expect(output.succeeded.length).toBeLessThan(3);
      expect(output.truncated).toBe(true);
      expect(output.processed).toBe(output.succeeded.length + output.failed.length);
      expect(output.processed).toBeLessThan(3);
    });

    it("reports truncated: false when every account finishes inside the budget", async () => {
      const repo = makeBatchRepo(pendingRows);
      const service = buildService({ repo, email });

      const result = await service.processPendingDeletions({
        batchSize: 3,
        dryRun: false,
        deadlineMs: 100,
        now: () => 0,
      });

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.succeeded).toHaveLength(3);
      expect(output.truncated).toBe(false);
    });

    it("records ACCOUNT_WIPE_PROVIDER_FAILURE when the wipe transaction throws", async () => {
      const badRows: PendingDeletionRow[] = [
        {
          userId: "u1",
          email: "u1@example.com",
          pendingDeletionUntil: new Date(Date.now() - 1000),
        },
      ];
      const repo = makeBatchRepo(badRows);
      const badTx = throwingUnitOfWork("db failure");
      const service = buildService({ repo, email, uow: badTx });

      const result = await service.processPendingDeletions({});

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.failed).toHaveLength(1);
      expect(output.failed[0]?.errorCode).toBe("ACCOUNT_WIPE_PROVIDER_FAILURE");
    });
  });

  describe("requestDataExport", () => {
    it("returns ACCOUNT_DELETION_NOT_FOUND when user is not found", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(Option.none()),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.requestDataExport({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
    });

    it("returns ACCOUNT_EXPORT_RATE_LIMITED when an export was requested too recently", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, RgpdError>(
            Option.some({ ...baseState, lastExportRequestedAt: Option.some(new Date()) }),
          ),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.requestDataExport({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_EXPORT_RATE_LIMITED");
    });

    it("propagates ACCOUNT_DELETION_NOT_FOUND when collectUserDataForExport returns not-found", async () => {
      const repo = makeRepo({
        collectUserDataForExport: mock(async () =>
          Result.fail<UserExportPayload, RgpdError>({
            code: "ACCOUNT_DELETION_NOT_FOUND",
            message: "user not found",
          }),
        ),
      });
      const service = buildService({ repo, email });

      const result = await service.requestDataExport({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
    });

    it("uploads payload, presigns download URL, emails the user and returns expiresAt", async () => {
      const repo = makeRepo();
      const storage = makeStorage();
      const service = buildService({ repo, email, storage });

      const result = await service.requestDataExport({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().ok).toBe(true);
      expect(result.getValue().expiresAt).toBe("2099-01-01T00:00:00Z");
      expect(storage.uploadObject).toHaveBeenCalled();
      expect(storage.presignDownload).toHaveBeenCalled();
      expect(email.sendTemplate).toHaveBeenCalledWith(
        "data_export_ready",
        "u@example.com",
        expect.objectContaining({ name: "User", downloadUrl: expect.any(String) }),
        expect.objectContaining({ idempotencyKey: expect.any(String), locale: "fr" }),
      );
      expect(repo.touchExportRequestedAt).toHaveBeenCalledWith("u1");
    });

    it("succeeds even when email send fails", async () => {
      const repo = makeRepo();
      const failEmail = {
        sendTemplate: mock(async () =>
          Result.fail({ code: "EMAIL_SEND_FAILED" as const, message: "smtp error" }),
        ),
      } as unknown as IEmailService;
      const service = buildService({ repo, email: failEmail });

      const result = await service.requestDataExport({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
    });
  });
});

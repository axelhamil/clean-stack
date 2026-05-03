import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { ITransactionManagerService } from "@packages/drizzle";
import type { IEmailService } from "../../ports/email.port";
import type {
  ExecuteWipeOutput,
  GdprError,
  IGdprRepository,
  PendingDeletionRow,
  SoleOwnedOrgWithMembers,
  UserDeletionState,
  UserExportPayload,
} from "../../ports/gdpr.port";
import type { IStorageService } from "../../ports/storage.port";
import { GdprService } from "../gdpr.service";

const baseState: UserDeletionState = {
  email: "u@example.com",
  name: "User",
  twoFactorEnabled: false,
  pendingDeletionUntil: null,
  deletedAt: null,
  lastExportRequestedAt: null,
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

const tx: ITransactionManagerService = {
  startTransaction: async (cb) => cb({} as never),
};

function makeRepo(overrides: Partial<IGdprRepository> = {}): IGdprRepository {
  return {
    findSoleOwnedNonPersonalOrgsWithMembers: mock(async () => Result.ok<never[], GdprError>([])),
    collectUserDataForExport: mock(async () =>
      Result.ok<UserExportPayload, GdprError>(stubExportPayload),
    ),
    markPendingDeletion: mock(async () => Result.ok<void, GdprError>()),
    clearPendingDeletion: mock(async () => Result.ok<void, GdprError>()),
    findUsersReadyForWipe: mock(async () => Result.ok<PendingDeletionRow[], GdprError>([])),
    executeWipe: mock(async () =>
      Result.ok<ExecuteWipeOutput, GdprError>({
        deletedOrgIds: ["org_personal", "org_solo"],
        anonymizedEmail: "deleted-uuid@anonymized.local",
      }),
    ),
    verifyPassword: mock(async () => Result.ok<boolean, GdprError>(true)),
    verifyTotp: mock(async () => Result.ok<boolean, GdprError>(true)),
    touchExportRequestedAt: mock(async () => Result.ok<void, GdprError>()),
    getUserDeletionState: mock(async () =>
      Result.ok<Option<UserDeletionState>, GdprError>(Option.some(baseState)),
    ),
    ...overrides,
  } as unknown as IGdprRepository;
}

function makeStorage(overrides: Partial<IStorageService> = {}): IStorageService {
  return {
    presignUpload: mock(async () => Result.ok({ url: "", expiresAt: "" })),
    presignDownload: mock(async () =>
      Result.ok({ url: "https://cdn.example.com/export.json", expiresAt: "2099-01-01T00:00:00Z" }),
    ),
    headObject: mock(async () => Result.ok({ size: 0, contentType: "" })),
    deleteObject: mock(async () => Result.ok<void, GdprError>()),
    uploadObject: mock(async () => Result.ok<void, GdprError>()),
    listObjectKeys: mock(async () => Result.ok(["u1/uploads/a", "u1/exports/b"])),
    deleteObjects: mock(async () => Result.ok<void, GdprError>()),
    publicUrlFor: mock(() => ""),
    ...overrides,
  } as unknown as IStorageService;
}

function makeEmail(): IEmailService {
  return {
    sendTemplate: mock(async () => Result.ok<void, GdprError>()),
  } as unknown as IEmailService;
}

describe("GdprService", () => {
  let email: IEmailService;

  beforeEach(() => {
    email = makeEmail();
  });

  describe("preflightAccountDeletion", () => {
    it("returns an empty blockingOrgs list when user has no blocking orgs", async () => {
      const repo = makeRepo();
      const service = new GdprService(repo, makeStorage(), email, tx);

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
          Result.ok<SoleOwnedOrgWithMembers[], GdprError>(blocking),
        ),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.preflightAccountDeletion({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().blockingOrgs).toEqual(blocking);
    });
  });

  describe("requestAccountDeletion", () => {
    it("returns ACCOUNT_DELETION_BLOCKED when sole-owner of non-personal orgs with members", async () => {
      const repo = makeRepo({
        findSoleOwnedNonPersonalOrgsWithMembers: mock(async () =>
          Result.ok<SoleOwnedOrgWithMembers[], GdprError>([
            { orgId: "org_1", orgName: "Acme", otherMembersCount: 3 },
          ]),
        ),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

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
        verifyPassword: mock(async () => Result.ok<boolean, GdprError>(false)),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.requestAccountDeletion({ userId: "u1", password: "wrong" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_PASSWORD_INVALID");
    });

    it("marks pending and emails when password is valid and 2FA disabled", async () => {
      const repo = makeRepo();
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.requestAccountDeletion({ userId: "u1", password: "good" });

      expect(result.isSuccess).toBe(true);
      expect(repo.markPendingDeletion).toHaveBeenCalled();
      expect(email.sendTemplate).toHaveBeenCalledWith(
        "delete_requested",
        "u@example.com",
        expect.objectContaining({ name: "User", cancelUrl: expect.any(String) }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });

    it("returns TWO_FACTOR_REQUIRED when 2FA enabled and no totpCode given", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, GdprError>(
            Option.some({ ...baseState, twoFactorEnabled: true }),
          ),
        ),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.requestAccountDeletion({ userId: "u1", password: "ignored" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("TWO_FACTOR_REQUIRED");
    });

    it("returns TWO_FACTOR_INVALID when TOTP code is invalid", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, GdprError>(
            Option.some({ ...baseState, twoFactorEnabled: true }),
          ),
        ),
        verifyTotp: mock(async () => Result.ok<boolean, GdprError>(false)),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.requestAccountDeletion({ userId: "u1", totpCode: "000000" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("TWO_FACTOR_INVALID");
    });

    it("returns existing pendingDeletionUntil when already pending without re-marking", async () => {
      const existing = new Date(Date.now() + 86400000);
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, GdprError>(
            Option.some({ ...baseState, pendingDeletionUntil: existing }),
          ),
        ),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

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
          Result.ok<Option<UserDeletionState>, GdprError>(
            Option.some({
              ...baseState,
              pendingDeletionUntil: new Date(Date.now() + 86400000),
            }),
          ),
        ),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.cancelAccountDeletion({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(repo.clearPendingDeletion).toHaveBeenCalledWith("u1");
      expect(email.sendTemplate).toHaveBeenCalledWith(
        "delete_cancelled",
        "u@example.com",
        expect.objectContaining({ name: "User" }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });

    it("returns ACCOUNT_DELETION_NOT_FOUND when nothing is pending", async () => {
      const repo = makeRepo();
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.cancelAccountDeletion({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
      expect(repo.clearPendingDeletion).not.toHaveBeenCalled();
    });
  });

  describe("executeAccountWipe", () => {
    const elapsedState: UserDeletionState = {
      ...baseState,
      pendingDeletionUntil: new Date(Date.now() - 1000),
    };

    it("anonymizes via repo, deletes storage prefix, and emails the user", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, GdprError>(Option.some(elapsedState)),
        ),
      });
      const storage = makeStorage();
      const service = new GdprService(repo, storage, email, tx);

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(repo.executeWipe).toHaveBeenCalled();
      expect(storage.listObjectKeys).toHaveBeenCalledWith("u1/");
      expect(storage.deleteObjects).toHaveBeenCalledWith(["u1/uploads/a", "u1/exports/b"]);
      expect(email.sendTemplate).toHaveBeenCalledWith(
        "delete_completed",
        "u@example.com",
        expect.objectContaining({ name: "User" }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
      expect(result.getValue().storageKeysDeleted).toBe(2);
    });

    it("returns success no-op when user is already deleted", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, GdprError>(
            Option.some({
              email: "deleted@anonymized.local",
              name: "[deleted]",
              twoFactorEnabled: false,
              pendingDeletionUntil: null,
              deletedAt: new Date(),
              lastExportRequestedAt: null,
            }),
          ),
        ),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().storageKeysDeleted).toBe(0);
      expect(repo.executeWipe).not.toHaveBeenCalled();
    });

    it("rejects when grace has not elapsed yet", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, GdprError>(
            Option.some({
              ...baseState,
              pendingDeletionUntil: new Date(Date.now() + 86400000),
            }),
          ),
        ),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.executeAccountWipe({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
      expect(repo.executeWipe).not.toHaveBeenCalled();
    });

    it("does not throw when storage cleanup fails — wipe is already committed", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, GdprError>(Option.some(elapsedState)),
        ),
      });
      const storage = makeStorage({
        listObjectKeys: mock(async () =>
          Result.fail({ code: "STORAGE_PROVIDER_FAILURE" as const, message: "boom" }),
        ) as IStorageService["listObjectKeys"],
      });
      const service = new GdprService(repo, storage, email, tx);

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
      overrides: Partial<IGdprRepository> = {},
    ): IGdprRepository {
      return makeRepo({
        findUsersReadyForWipe: mock(async () => Result.ok<PendingDeletionRow[], GdprError>(rows)),
        getUserDeletionState: mock(async (userId: string) =>
          Result.ok<Option<UserDeletionState>, GdprError>(
            Option.some({
              email: `${userId}@example.com`,
              name: "User",
              twoFactorEnabled: false,
              pendingDeletionUntil: new Date(Date.now() - 1000),
              deletedAt: null,
              lastExportRequestedAt: null,
            }),
          ),
        ),
        ...overrides,
      });
    }

    it("returns the pending list without calling wipe in dryRun mode", async () => {
      const repo = makeBatchRepo(pendingRows);
      const service = new GdprService(repo, makeStorage(), email, tx);

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
          Result.ok<PendingDeletionRow[], GdprError>(pendingRows.slice(0, limit)),
        ),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.processPendingDeletions({ batchSize: 2 });

      expect(result.isSuccess).toBe(true);
      expect(repo.findUsersReadyForWipe).toHaveBeenCalledWith(2);
      expect(result.getValue().processed).toBe(2);
    });

    it("processes all rows and reports successes (happy path)", async () => {
      const repo = makeBatchRepo(pendingRows);
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.processPendingDeletions({});

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.dryRun).toBe(false);
      expect(output.processed).toBe(3);
      expect(output.succeeded).toHaveLength(3);
      expect(output.failed).toHaveLength(0);
    });

    it("aggregates failures without throwing — other users still processed", async () => {
      const repo = makeBatchRepo(pendingRows, {
        getUserDeletionState: mock(async (userId: string) => {
          if (userId === "u2") {
            return Result.ok<Option<UserDeletionState>, GdprError>(Option.none());
          }
          return Result.ok<Option<UserDeletionState>, GdprError>(
            Option.some({
              email: `${userId}@example.com`,
              name: "User",
              twoFactorEnabled: false,
              pendingDeletionUntil: new Date(Date.now() - 1000),
              deletedAt: null,
              lastExportRequestedAt: null,
            }),
          );
        }),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.processPendingDeletions({});

      expect(result.isSuccess).toBe(true);
      const output = result.getValue();
      expect(output.processed).toBe(3);
      expect(output.succeeded).toContain("u1");
      expect(output.succeeded).toContain("u3");
      expect(output.failed.some((f) => f.userId === "u2")).toBe(true);
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
      const badTx: ITransactionManagerService = {
        startTransaction: async () => {
          throw new Error("db failure");
        },
      };
      const service = new GdprService(repo, makeStorage(), email, badTx);

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
          Result.ok<Option<UserDeletionState>, GdprError>(Option.none()),
        ),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.requestDataExport({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
    });

    it("returns ACCOUNT_EXPORT_RATE_LIMITED when an export was requested too recently", async () => {
      const repo = makeRepo({
        getUserDeletionState: mock(async () =>
          Result.ok<Option<UserDeletionState>, GdprError>(
            Option.some({ ...baseState, lastExportRequestedAt: new Date() }),
          ),
        ),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.requestDataExport({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_EXPORT_RATE_LIMITED");
    });

    it("propagates ACCOUNT_DELETION_NOT_FOUND when collectUserDataForExport returns not-found", async () => {
      const repo = makeRepo({
        collectUserDataForExport: mock(async () =>
          Result.fail<UserExportPayload, GdprError>({
            code: "ACCOUNT_DELETION_NOT_FOUND",
            message: "user not found",
          }),
        ),
      });
      const service = new GdprService(repo, makeStorage(), email, tx);

      const result = await service.requestDataExport({ userId: "u1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
    });

    it("uploads payload, presigns download URL, emails the user and returns expiresAt", async () => {
      const repo = makeRepo();
      const storage = makeStorage();
      const service = new GdprService(repo, storage, email, tx);

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
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
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
      const service = new GdprService(repo, makeStorage(), failEmail, tx);

      const result = await service.requestDataExport({ userId: "u1" });

      expect(result.isSuccess).toBe(true);
    });
  });
});

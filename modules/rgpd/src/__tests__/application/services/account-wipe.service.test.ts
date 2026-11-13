import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { type ILogger, Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type {
  IAccountEraser,
  RemovedMembership,
} from "../../../application/ports/repositories/account-eraser.port";
import type {
  IDeletionStateRepository,
  RgpdError,
} from "../../../application/ports/repositories/deletion-state.port";
import type {
  IApiTokenRevoker,
  RevokedApiToken,
} from "../../../application/ports/services/api-token-revoker.port";
import type {
  EndedSessionRow,
  IEndedSessionsReader,
} from "../../../application/ports/services/ended-sessions.port";
import type { IExportStorage } from "../../../application/ports/services/export-storage.port";
import type { IStaffAccessRules } from "../../../application/ports/services/staff-access-rules.port";
import type { IStaffDataEraser } from "../../../application/ports/services/staff-data-eraser.port";
import type {
  EndedImpersonation,
  IStaffStore,
  StaffRecord,
  StaffStoreError,
} from "../../../application/ports/services/staff-store.port";
import { AccountWipeService } from "../../../application/services/account-wipe.service";
import {
  EMAIL_DOWN,
  inTransaction,
  NOW,
  REPO_DOWN,
  recordingEmail,
  recordingOutbox,
  sameUnit,
  USER_ID,
  userState,
} from "../fixtures";

const ELAPSED = { pendingUntil: new Date(NOW.getTime() - 1000) };
const PORT_DOWN: StaffStoreError = { code: "ADMIN_STAFF_PROVIDER_FAILURE", message: "boom" };

interface WipeWorld {
  memberships?: RemovedMembership[];
  deletedOrgIds?: string[];
  revokedTokens?: RevokedApiToken[];
  staffRow?: Option<StaffRecord>;
}

function impersonation(over: Partial<EndedImpersonation>): EndedImpersonation {
  return {
    sessionId: "s1",
    userId: USER_ID,
    impersonatedBy: "staff-1",
    createdAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    ...over,
  };
}

function given({
  memberships = [],
  deletedOrgIds = ["org_personal"],
  revokedTokens = [],
  staffRow = Option.none(),
}: WipeWorld = {}) {
  const seen: unknown[] = [];
  const steps: string[] = [];
  const states = mockPort<IDeletionStateRepository>();
  const eraser = mockPort<IAccountEraser>();
  const staffData = mockPort<IStaffDataEraser>();
  const apiTokens = mockPort<IApiTokenRevoker>();
  const endedSessions = mockPort<IEndedSessionsReader>();
  const staff = mockPort<IStaffStore>();
  const staffAccess = mockPort<IStaffAccessRules>();
  const storage = mockPort<IExportStorage>();
  const email = recordingEmail(seen);
  const outbox = recordingOutbox(seen);
  const uow = mockUnitOfWork();
  const instrumentation = mockInstrumentation();
  const logger = mockPort<ILogger>();

  states.findByUser.mockResolvedValue(Result.ok(Option.some(userState(ELAPSED))));
  eraser.anonymize.mockImplementation(async () => {
    steps.push("anonymize");
    seen.push(UnitOfWorkContext.transaction());
    return Result.ok(true);
  });
  staffData.eraseDataOf.mockImplementation(async () => {
    steps.push("staff data");
    return Result.ok();
  });
  eraser.endSessionsAndCredentials.mockImplementation(async () => {
    steps.push("sessions");
    return Result.ok<EndedSessionRow[], RgpdError>([]);
  });
  eraser.removeMemberships.mockImplementation(async () => {
    steps.push("memberships");
    return Result.ok(memberships);
  });
  apiTokens.execute.mockImplementation(async () => {
    steps.push("api tokens");
    return Result.ok(revokedTokens);
  });
  eraser.deleteAbandonedOrganizations.mockImplementation(async () => {
    steps.push("organizations");
    return Result.ok(deletedOrgIds);
  });
  endedSessions.impersonationsOf.mockReturnValue([]);
  staffAccess.announceImpersonationsEnded.mockResolvedValue(undefined);
  staff.findActive.mockResolvedValue(Result.ok(staffRow));
  staff.revoke.mockImplementation(
    inTransaction(seen, Result.ok<EndedImpersonation[], StaffStoreError>([])),
  );
  storage.listObjectKeys.mockResolvedValue(Result.ok(["u1/uploads/a", "u1/exports/b"]));
  storage.deleteObjects.mockResolvedValue(Result.ok());

  const service = new AccountWipeService({
    states,
    eraser,
    staffData,
    apiTokens,
    endedSessions,
    staff,
    staffAccess,
    storage,
    email,
    transactions: uow.unitOfWork,
    outbox,
    instrumentation,
    logger,
  });

  return {
    seen,
    steps,
    states,
    eraser,
    staffData,
    apiTokens,
    endedSessions,
    staff,
    staffAccess,
    storage,
    email,
    outbox,
    uow,
    instrumentation,
    logger,
    service,
  };
}

function eventsOfType(world: ReturnType<typeof given>, type: string) {
  return enqueuedEvents(world.outbox).filter((e) => e.eventType === type);
}

function announcedAsRevoked(world: ReturnType<typeof given>) {
  return world.staffAccess.announceImpersonationsEnded.mock.calls
    .filter(([, reason]) => reason === "revoked")
    .flatMap(([ended]) => ended);
}

describe("wipe an account whose grace period has elapsed", () => {
  beforeEach(() => setSystemTime(NOW));

  afterEach(() => setSystemTime());

  describe("given the account cannot be wiped yet", () => {
    it("refuses an unknown user as not found", async () => {
      const world = given();
      world.states.findByUser.mockResolvedValue(Result.ok(Option.none()));

      const result = await world.service.wipe(USER_ID);

      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
      expect(world.eraser.anonymize).not.toHaveBeenCalled();
    });

    it("refuses an account whose grace has not elapsed and erases nothing", async () => {
      const world = given();
      world.states.findByUser.mockResolvedValue(
        Result.ok(Option.some(userState({ pendingUntil: new Date(NOW.getTime() + 86_400_000) }))),
      );

      const result = await world.service.wipe(USER_ID);

      expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
      expect(world.eraser.anonymize).not.toHaveBeenCalled();
    });

    it("succeeds without erasing or emitting anything when the account is already wiped", async () => {
      const world = given();
      world.states.findByUser.mockResolvedValue(
        Result.ok(Option.some(userState({ wipedAt: new Date(NOW.getTime() - 1000) }))),
      );

      const result = await world.service.wipe(USER_ID);

      expect(result.getValue()).toEqual({ deletedOrgIds: [], storageKeysDeleted: 0 });
      expect(world.eraser.anonymize).not.toHaveBeenCalled();
      expect(enqueuedEvents(world.outbox)).toEqual([]);
    });
  });

  it("anonymizes the user row first, then erases staff data, sessions, memberships, tokens and organizations", async () => {
    const world = given();

    await world.service.wipe(USER_ID);

    expect(world.steps).toEqual([
      "anonymize",
      "staff data",
      "sessions",
      "memberships",
      "api tokens",
      "organizations",
    ]);
  });

  it("deletes the organizations the erased memberships leave abandoned", async () => {
    const world = given({
      memberships: [
        { memberId: "mem_personal", organizationId: "org_personal" },
        { memberId: "mem_team", organizationId: "org_team" },
      ],
    });

    const result = await world.service.wipe(USER_ID);

    expect(world.eraser.deleteAbandonedOrganizations).toHaveBeenCalledWith([
      "org_personal",
      "org_team",
    ]);
    expect(result.getValue().deletedOrgIds).toEqual(["org_personal"]);
  });

  it("emits every event and enqueues the confirmation email inside one committed unit", async () => {
    const world = given({
      memberships: [{ memberId: "mem_team", organizationId: "org_team" }],
      revokedTokens: [{ tokenId: "tok_1", organizationId: Option.none() }],
      staffRow: Option.some({ userId: USER_ID, role: "support", source: "console" }),
    });

    const result = await world.service.wipe(USER_ID);

    expect(result.isSuccess).toBe(true);
    expect(world.uow.outcome()).toBe("committed");
    expect(world.seen).toHaveLength(8);
    expect(sameUnit(world.seen)).toBe(true);
    expect(world.email.sendTemplate).toHaveBeenCalledWith(
      "delete_completed",
      "u@example.com",
      { name: "User" },
      { locale: "fr", idempotencyKey: "delete-completed/u1" },
    );
  });

  it("rolls the whole wipe back when the confirmation email cannot be enqueued", async () => {
    const world = given();
    world.email.sendTemplate.mockResolvedValue(Result.fail(EMAIL_DOWN));

    const result = await world.service.wipe(USER_ID);

    expect(result.getError().code).toBe("ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE");
    expect(world.uow.outcome()).toBe("rolled_back");
    expect(world.storage.listObjectKeys).not.toHaveBeenCalled();
  });

  it("emits nothing a second time when another run already anonymized the row", async () => {
    const world = given();
    world.eraser.anonymize.mockResolvedValue(Result.ok(false));

    const result = await world.service.wipe(USER_ID);

    expect(result.isSuccess).toBe(true);
    expect(world.staffData.eraseDataOf).not.toHaveBeenCalled();
    expect(enqueuedEvents(world.outbox)).toEqual([]);
    expect(world.email.sendTemplate).not.toHaveBeenCalled();
  });

  it("rolls back and logs the cause when the staff data eraser fails", async () => {
    const world = given();
    world.staffData.eraseDataOf.mockResolvedValue(Result.fail(PORT_DOWN));

    const result = await world.service.wipe(USER_ID);

    expect(result.getError().code).toBe("ACCOUNT_WIPE_PROVIDER_FAILURE");
    expect(world.uow.outcome()).toBe("rolled_back");
    expect(world.logger.error).toHaveBeenCalledWith(
      { err: PORT_DOWN, userId: USER_ID },
      "account wipe failed in a foreign erasure step",
    );
  });

  it("rolls back and logs the cause when the api token revoker fails", async () => {
    const world = given();
    world.apiTokens.execute.mockResolvedValue(Result.fail(PORT_DOWN));

    const result = await world.service.wipe(USER_ID);

    expect(result.getError().code).toBe("ACCOUNT_WIPE_PROVIDER_FAILURE");
    expect(world.uow.outcome()).toBe("rolled_back");
    expect(world.logger.error).toHaveBeenCalledWith(
      { err: PORT_DOWN, userId: USER_ID },
      "account wipe failed in a foreign erasure step",
    );
  });

  it("rolls back when an erasure step of the account fails", async () => {
    const world = given();
    world.eraser.removeMemberships.mockResolvedValue(Result.fail(REPO_DOWN));

    const result = await world.service.wipe(USER_ID);

    expect(result.getError().code).toBe("ACCOUNT_WIPE_PROVIDER_FAILURE");
    expect(world.uow.outcome()).toBe("rolled_back");
    expect(enqueuedEvents(world.outbox)).toEqual([]);
  });

  describe("given the user is a staff member", () => {
    const staffRow = Option.some<StaffRecord>({
      userId: USER_ID,
      role: "manager",
      source: "console",
    });

    it("revokes the staff access and announces it with the erased user as actor", async () => {
      const world = given({ staffRow });

      const result = await world.service.wipe(USER_ID);

      expect(result.isSuccess).toBe(true);
      expect(world.staff.revoke).toHaveBeenCalledWith(USER_ID);
      expect(eventsOfType(world, EventTypes.ADMIN_STAFF_REVOKED)).toEqual([
        {
          eventType: EventTypes.ADMIN_STAFF_REVOKED,
          aggregateId: USER_ID,
          payload: { actorUserId: USER_ID, userId: USER_ID, role: "manager" },
        },
      ]);
    });

    it("rolls the wipe back when the staff revocation fails", async () => {
      const world = given({ staffRow });
      world.staff.revoke.mockResolvedValue(Result.fail(PORT_DOWN));

      const result = await world.service.wipe(USER_ID);

      expect(result.getError().code).toBe("ACCOUNT_WIPE_PROVIDER_FAILURE");
      expect(world.uow.outcome()).toBe("rolled_back");
    });

    it("announces the impersonations the staff member still ran as revoked", async () => {
      const world = given({ staffRow });
      const ran = impersonation({ userId: "customer", impersonatedBy: USER_ID });
      world.staff.revoke.mockResolvedValue(Result.ok([ran]));

      await world.service.wipe(USER_ID);

      expect(announcedAsRevoked(world)).toEqual([ran]);
    });
  });

  it("revokes nothing on the staff side for a user who is not staff", async () => {
    const world = given();

    await world.service.wipe(USER_ID);

    expect(world.staff.revoke).not.toHaveBeenCalled();
    expect(eventsOfType(world, EventTypes.ADMIN_STAFF_REVOKED)).toEqual([]);
  });

  it("announces each impersonation of the erased customer as revoked", async () => {
    const world = given();
    const suffered = impersonation({ impersonatedBy: "staff-1", userId: USER_ID });
    world.endedSessions.impersonationsOf.mockReturnValue([suffered]);

    await world.service.wipe(USER_ID);

    expect(announcedAsRevoked(world)).toEqual([suffered]);
  });

  describe("names the actor of every event", () => {
    const world = () =>
      given({
        memberships: [
          { memberId: "mem_personal", organizationId: "org_personal" },
          { memberId: "mem_team", organizationId: "org_team" },
        ],
        deletedOrgIds: ["org_personal"],
        revokedTokens: [
          { tokenId: "tok_personal", organizationId: Option.none() },
          { tokenId: "tok_team", organizationId: Option.some("org_team") },
        ],
      });

    it("names only the erased user in USER_DELETED", async () => {
      const w = world();

      await w.service.wipe(USER_ID);

      expect(eventsOfType(w, EventTypes.USER_DELETED)).toEqual([
        {
          eventType: EventTypes.USER_DELETED,
          aggregateId: USER_ID,
          payload: { userId: USER_ID, deletedAt: NOW },
        },
      ]);
    });

    it("attributes each deleted organization to the erased user", async () => {
      const w = world();

      await w.service.wipe(USER_ID);

      expect(eventsOfType(w, EventTypes.ORG_DELETED)).toEqual([
        {
          eventType: EventTypes.ORG_DELETED,
          aggregateId: "org_personal",
          payload: { organizationId: "org_personal", actorUserId: USER_ID },
        },
      ]);
    });

    it("announces the membership removal only for the organizations that survive", async () => {
      const w = world();

      await w.service.wipe(USER_ID);

      expect(eventsOfType(w, EventTypes.ORG_MEMBER_REMOVED)).toEqual([
        {
          eventType: EventTypes.ORG_MEMBER_REMOVED,
          aggregateId: "mem_team",
          payload: { organizationId: "org_team", actorUserId: USER_ID, userId: USER_ID },
        },
      ]);
    });

    it("announces each revoked api token, with no organization when it had none", async () => {
      const w = world();

      await w.service.wipe(USER_ID);

      expect(eventsOfType(w, EventTypes.API_TOKEN_REVOKED)).toEqual([
        {
          eventType: EventTypes.API_TOKEN_REVOKED,
          aggregateId: "tok_personal",
          payload: {
            userId: USER_ID,
            actorUserId: USER_ID,
            organizationId: null,
            tokenId: "tok_personal",
            reason: "user",
          },
        },
        {
          eventType: EventTypes.API_TOKEN_REVOKED,
          aggregateId: "tok_team",
          payload: {
            userId: USER_ID,
            actorUserId: USER_ID,
            organizationId: "org_team",
            tokenId: "tok_team",
            reason: "user",
          },
        },
      ]);
    });
  });

  describe("purges the object storage after commit", () => {
    it("deletes every object under the user prefix and counts them", async () => {
      const world = given();

      const result = await world.service.wipe(USER_ID);

      expect(world.storage.listObjectKeys).toHaveBeenCalledWith("u1/");
      expect(world.storage.deleteObjects).toHaveBeenCalledWith(["u1/uploads/a", "u1/exports/b"]);
      expect(result.getValue().storageKeysDeleted).toBe(2);
    });

    it("keeps the wipe successful and logs for manual cleanup when the listing fails", async () => {
      const world = given();
      world.storage.listObjectKeys.mockResolvedValue(
        Result.fail({ code: "STORAGE_PROVIDER_FAILURE", message: "boom" }),
      );

      const result = await world.service.wipe(USER_ID);

      expect(result.getValue().storageKeysDeleted).toBe(0);
      expect(world.uow.outcome()).toBe("committed");
      expect(world.logger.warn).toHaveBeenCalled();
    });

    it("keeps the wipe successful and logs for manual cleanup when the delete fails", async () => {
      const world = given();
      world.storage.deleteObjects.mockResolvedValue(
        Result.fail({ code: "STORAGE_PROVIDER_FAILURE", message: "boom" }),
      );

      const result = await world.service.wipe(USER_ID);

      expect(result.isSuccess).toBe(true);
      expect(world.logger.warn).toHaveBeenCalled();
    });
  });

  it("reports a provider failure and surfaces the error to telemetry when the transaction throws", async () => {
    const world = given();
    const crash = new Error("connection terminated unexpectedly");
    world.uow.unitOfWork.run.mockRejectedValue(crash);

    const result = await world.service.wipe(USER_ID);

    expect(result.getError().code).toBe("ACCOUNT_WIPE_PROVIDER_FAILURE");
    expect(world.instrumentation.capture).toHaveBeenCalledWith(crash);
  });
});

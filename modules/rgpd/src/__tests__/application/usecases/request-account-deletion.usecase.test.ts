import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { type ILogger, Option, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { EventTypes } from "@packages/events";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type {
  IDeletionStateRepository,
  UserDeletionState,
} from "../../../application/ports/repositories/deletion-state.port";
import type { IPasswordVerifier } from "../../../application/ports/services/password-verifier.port";
import type { IStaffAccessRules } from "../../../application/ports/services/staff-access-rules.port";
import type {
  IStaffStore,
  StaffManagerRecord,
  StaffRecord,
} from "../../../application/ports/services/staff-store.port";
import type {
  ITotpVerifier,
  TotpOutcome,
  TotpVerifierError,
} from "../../../application/ports/services/totp-verifier.port";
import type { IPreflightAccountDeletionQuery } from "../../../application/queries/preflight-account-deletion.query";
import { RequestAccountDeletionUseCase } from "../../../application/usecases/request-account-deletion/request-account-deletion.usecase";
import {
  DAY_MS,
  EMAIL_DOWN,
  inTransaction,
  NOW,
  recordingOutbox,
  sameUnit,
  USER_ID,
  userState,
} from "../fixtures";

const GRACE_DAYS = 7;
const UNTIL = new Date(NOW.getTime() + GRACE_DAYS * DAY_MS);
const withPassword = { userId: USER_ID, password: "secret" };
const MANAGER = Option.some<StaffRecord>({ userId: USER_ID, role: "manager", source: "console" });

interface RequestWorld {
  state?: UserDeletionState;
  staffRow?: Option<StaffRecord>;
  managers?: StaffManagerRecord[];
  listed?: string[];
}

function given({
  state = userState(),
  staffRow = Option.none(),
  managers = [],
  listed = [],
}: RequestWorld = {}) {
  const seen: unknown[] = [];
  const states = mockPort<IDeletionStateRepository>();
  const preflight = mockPort<IPreflightAccountDeletionQuery>();
  const totp = mockPort<ITotpVerifier>();
  const passwords = mockPort<IPasswordVerifier>();
  const staff = mockPort<IStaffStore>();
  const staffAccess = mockPort<IStaffAccessRules>();
  const email = mockPort<IEmailService>();
  const outbox = recordingOutbox(seen);
  const uow = mockUnitOfWork();
  const logger = mockPort<ILogger>();

  states.findByUser.mockResolvedValue(Result.ok(Option.some(state)));
  states.markPending.mockImplementation(inTransaction(seen, Result.ok()));
  preflight.execute.mockResolvedValue(Result.ok({ blockingOrgs: [] }));
  totp.consume.mockResolvedValue(Result.ok<TotpOutcome, TotpVerifierError>("accepted"));
  passwords.matches.mockResolvedValue(Result.ok(true));
  staff.findActive.mockResolvedValue(Result.ok(staffRow));
  staff.lockActiveManagers.mockImplementation(inTransaction(seen, Result.ok(managers)));
  staffAccess.isListed.mockImplementation((userId) => listed.includes(userId));
  staffAccess.grantsStaffAccess.mockReturnValue(true);
  staffAccess.isLastManager.mockImplementation(
    (target, locked) => !locked.some((m) => m.userId !== target),
  );
  email.sendTemplate.mockResolvedValue(Result.ok());

  const useCase = new RequestAccountDeletionUseCase({
    states,
    preflight,
    totp,
    passwords,
    staff,
    staffAccess,
    email,
    transactions: uow.unitOfWork,
    outbox,
    settings: { appUrl: "https://app.example.com", gracePeriodDays: GRACE_DAYS },
    logger,
  });

  return { seen, states, preflight, totp, passwords, staff, email, outbox, uow, logger, useCase };
}

describe("request the deletion of an account", () => {
  beforeEach(() => setSystemTime(NOW));

  afterEach(() => setSystemTime());

  it("refuses an unknown user as not found", async () => {
    const world = given();
    world.states.findByUser.mockResolvedValue(Result.ok(Option.none()));

    const result = await world.useCase.execute(withPassword);

    expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
  });

  it("returns the date already set without marking again when a deletion is pending", async () => {
    const existing = new Date(NOW.getTime() + DAY_MS);
    const world = given({ state: userState({ pendingUntil: existing }) });

    const result = await world.useCase.execute(withPassword);

    expect(result.getValue()).toEqual({ pendingDeletionUntil: existing.toISOString() });
    expect(world.states.markPending).not.toHaveBeenCalled();
    expect(enqueuedEvents(world.outbox)).toEqual([]);
  });

  it("refuses a sole owner of organizations with other members and lists them", async () => {
    const world = given();
    const blocking = [{ orgId: "org_1", orgName: "Acme", otherMembersCount: 3 }];
    world.preflight.execute.mockResolvedValue(Result.ok({ blockingOrgs: blocking }));

    const result = await world.useCase.execute(withPassword);

    expect(result.getError().code).toBe("ACCOUNT_DELETION_BLOCKED");
    expect(result.getError().metadata?.offendingOrgs).toEqual(blocking);
    expect(world.states.markPending).not.toHaveBeenCalled();
  });

  describe("given two-factor is enabled", () => {
    const twoFactor = () => given({ state: userState({}, { twoFactorEnabled: true }) });

    it("requires the TOTP code, a password not being enough", async () => {
      const world = twoFactor();

      const result = await world.useCase.execute(withPassword);

      expect(result.getError().code).toBe("TWO_FACTOR_REQUIRED");
      expect(world.passwords.matches).not.toHaveBeenCalled();
    });

    it.each<TotpOutcome>(["invalid", "replayed", "not_enrolled"])(
      "refuses a TOTP code the verifier reports %s",
      async (outcome) => {
        const world = twoFactor();
        world.totp.consume.mockResolvedValue(Result.ok(outcome));

        const result = await world.useCase.execute({ userId: USER_ID, totpCode: "000000" });

        expect(result.getError().code).toBe("TWO_FACTOR_INVALID");
        expect(world.states.markPending).not.toHaveBeenCalled();
      },
    );

    it("accepts an accepted TOTP code without checking any password", async () => {
      const world = twoFactor();

      const result = await world.useCase.execute({ userId: USER_ID, totpCode: "123456" });

      expect(result.isSuccess).toBe(true);
      expect(world.totp.consume).toHaveBeenCalledWith(USER_ID, "123456");
      expect(world.passwords.matches).not.toHaveBeenCalled();
    });
  });

  describe("given two-factor is disabled", () => {
    it("requires the password", async () => {
      const world = given();

      const result = await world.useCase.execute({ userId: USER_ID });

      expect(result.getError().code).toBe("ACCOUNT_PASSWORD_REQUIRED");
    });

    it("refuses a wrong password", async () => {
      const world = given();
      world.passwords.matches.mockResolvedValue(Result.ok(false));

      const result = await world.useCase.execute({ userId: USER_ID, password: "wrong" });

      expect(result.getError().code).toBe("ACCOUNT_PASSWORD_INVALID");
      expect(world.states.markPending).not.toHaveBeenCalled();
    });
  });

  it("marks the account pending for the grace period and announces it in one unit", async () => {
    const world = given();

    const result = await world.useCase.execute(withPassword);

    expect(result.getValue()).toEqual({ pendingDeletionUntil: UNTIL.toISOString() });
    expect(world.states.markPending).toHaveBeenCalledWith(USER_ID, UNTIL);
    expect(enqueuedEvents(world.outbox)).toEqual([
      {
        eventType: EventTypes.USER_DELETION_REQUESTED,
        aggregateId: USER_ID,
        payload: { userId: USER_ID, pendingDeletionUntil: UNTIL },
      },
    ]);
    expect(world.seen).toHaveLength(2);
    expect(sameUnit(world.seen)).toBe(true);
    expect(world.uow.outcome()).toBe("committed");
  });

  it("emails the cancel link with an idempotency key bound to the deadline", async () => {
    const world = given();

    await world.useCase.execute(withPassword);

    expect(world.email.sendTemplate).toHaveBeenCalledWith(
      "delete_requested",
      "u@example.com",
      {
        name: "User",
        cancelUrl: "https://app.example.com/settings/account",
        expiresAt: UNTIL.toISOString(),
      },
      { idempotencyKey: `delete-requested/${USER_ID}/${UNTIL.getTime()}`, locale: "fr" },
    );
  });

  it("keeps the request when the email fails, only logging it", async () => {
    const world = given();
    world.email.sendTemplate.mockResolvedValue(Result.fail(EMAIL_DOWN));

    const result = await world.useCase.execute(withPassword);

    expect(result.isSuccess).toBe(true);
    expect(world.uow.outcome()).toBe("committed");
    expect(world.logger.warn).toHaveBeenCalled();
  });

  describe("given the user is a staff manager", () => {
    it("refuses the last manager inside the unit, after locking the managers, and marks nothing", async () => {
      const world = given({
        staffRow: MANAGER,
        managers: [{ userId: USER_ID, source: "console" }],
      });

      const result = await world.useCase.execute(withPassword);

      expect(result.getError().code).toBe("ACCOUNT_DELETION_LAST_MANAGER_FORBIDDEN");
      expect(world.seen).toHaveLength(1);
      expect(world.seen[0]).toBeDefined();
      expect(world.states.markPending).not.toHaveBeenCalled();
      expect(enqueuedEvents(world.outbox)).toEqual([]);
      expect(world.uow.outcome()).toBe("rolled_back");
    });

    it("lets a manager go when another one remains", async () => {
      const world = given({
        staffRow: MANAGER,
        managers: [
          { userId: USER_ID, source: "console" },
          { userId: "u2", source: "console" },
        ],
      });

      expect((await world.useCase.execute(withPassword)).isSuccess).toBe(true);
    });

    it("lets an env listed last manager go, the env being the recovery", async () => {
      const world = given({
        staffRow: MANAGER,
        managers: [{ userId: USER_ID, source: "console" }],
        listed: [USER_ID],
      });

      expect((await world.useCase.execute(withPassword)).isSuccess).toBe(true);
    });
  });

  it("lets a support member go without locking the managers", async () => {
    const world = given({
      staffRow: Option.some({ userId: USER_ID, role: "support", source: "console" }),
    });

    const result = await world.useCase.execute(withPassword);

    expect(result.isSuccess).toBe(true);
    expect(world.staff.lockActiveManagers).not.toHaveBeenCalled();
  });
});

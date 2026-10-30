import { describe, expect, it } from "bun:test";
import type { StaffRole } from "@packages/access-control";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { enqueuedEvents } from "../../../shared/__TESTS__/enqueued-events";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import type {
  IStaffStore,
  StaffManagerRecord,
  StaffRecord,
} from "../../../shared/ports/staff-store.port";
import type { AdminUserRow, IAdminUserStore } from "../application/ports/admin-user-store.port";
import { StaffService } from "../application/services/staff.service";

const ACTOR = "actor";
const TARGET = "target";

const USER: AdminUserRow = {
  id: TARGET,
  email: "t@example.com",
  name: "T",
  banned: false,
  banReason: Option.none(),
  banExpires: Option.none(),
  twoFactorEnabled: false,
  createdAt: new Date("2026-01-01"),
};

function member(role: StaffRole): Option<StaffRecord> {
  return Option.some({ userId: TARGET, role, source: "console", banned: false, overrides: [] });
}

function setup(given: {
  target?: Option<StaffRecord>;
  managers?: StaffManagerRecord[];
  user?: Option<AdminUserRow>;
  listed?: string[];
}) {
  const store = mockPort<IStaffStore>();
  store.findActive.mockImplementation(async () => Result.ok(given.target ?? Option.none()));
  store.lockActiveManagers.mockImplementation(async () =>
    Result.ok(given.managers ?? [{ userId: ACTOR, source: "console" }]),
  );
  store.assign.mockImplementation(async () => Result.ok());
  store.revoke.mockImplementation(async () => Result.ok());
  store.endImpersonationsBy.mockImplementation(async () => Result.ok());

  const users = mockPort<IAdminUserStore>();
  users.findUserById.mockImplementation(async () => Result.ok(given.user ?? Option.some(USER)));

  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});

  const { unitOfWork, outcome } = mockUnitOfWork();
  const service = new StaffService(store, users, outbox, unitOfWork, {
    PLATFORM_ADMIN_IDS: given.listed ?? [],
  });

  return { store, outbox, service, outcome };
}

const change = { actorUserId: ACTOR, targetUserId: TARGET };
const onlyTargetManages: StaffManagerRecord[] = [{ userId: TARGET, source: "console" }];

describe("StaffService", () => {
  describe("assignRole", () => {
    it("adds a user with no row and announces it with the actor", async () => {
      const { store, outbox, service } = setup({});

      const result = await service.assignRole({ ...change, role: "support" });

      expect(result.isSuccess).toBe(true);
      expect(store.assign).toHaveBeenCalledWith({
        userId: TARGET,
        role: "support",
        createdBy: ACTOR,
      });
      expect(enqueuedEvents(outbox)).toEqual([
        {
          eventType: EventTypes.ADMIN_STAFF_ADDED,
          aggregateId: TARGET,
          payload: { actorUserId: ACTOR, userId: TARGET, role: "support", source: "console" },
        },
      ]);
    });

    it("refuses to add a user who does not exist", async () => {
      const { store, service } = setup({ user: Option.none() });

      const result = await service.assignRole({ ...change, role: "support" });

      expect(result.getError().code).toBe("ADMIN_USER_NOT_FOUND");
      expect(store.assign).not.toHaveBeenCalled();
    });

    it("changes a role and announces both ends of it", async () => {
      const { outbox, service } = setup({ target: member("support") });

      await service.assignRole({ ...change, role: "auditor" });

      expect(enqueuedEvents(outbox)).toEqual([
        {
          eventType: EventTypes.ADMIN_STAFF_ROLE_CHANGED,
          aggregateId: TARGET,
          payload: { actorUserId: ACTOR, userId: TARGET, from: "support", to: "auditor" },
        },
      ]);
    });

    it("writes nothing when the role is unchanged", async () => {
      const { store, outbox, service } = setup({ target: member("support") });

      await service.assignRole({ ...change, role: "support" });

      expect(store.assign).not.toHaveBeenCalled();
      expect(enqueuedEvents(outbox)).toEqual([]);
    });

    it("refuses to demote the last manager", async () => {
      const { store, service } = setup({ target: member("manager"), managers: onlyTargetManages });

      const result = await service.assignRole({ ...change, role: "support" });

      expect(result.getError().code).toBe("ADMIN_STAFF_LAST_MANAGER_FORBIDDEN");
      expect(store.assign).not.toHaveBeenCalled();
    });

    it("refuses a change of one's own access", async () => {
      const { store, service } = setup({});

      const result = await service.assignRole({
        actorUserId: ACTOR,
        targetUserId: ACTOR,
        role: "auditor",
      });

      expect(result.getError().code).toBe("ADMIN_STAFF_SELF_CHANGE_FORBIDDEN");
      expect(store.lockActiveManagers).not.toHaveBeenCalled();
    });

    it("refuses a change of a listed id, which only the env can change", async () => {
      const { service } = setup({ listed: [TARGET] });

      const result = await service.assignRole({ ...change, role: "auditor" });

      expect(result.getError().code).toBe("ADMIN_STAFF_LISTED_FORBIDDEN");
    });
  });

  describe("assignRole on a row that grants nothing", () => {
    const delisted = Option.some<StaffRecord>({
      userId: TARGET,
      role: "manager",
      source: "env",
      banned: false,
      overrides: [],
    });

    it("treats a de-listed row as absent and announces the grant", async () => {
      const { store, outbox, service } = setup({ target: delisted });

      const result = await service.assignRole({ ...change, role: "manager" });

      expect(result.isSuccess).toBe(true);
      expect(store.assign).toHaveBeenCalledWith({
        userId: TARGET,
        role: "manager",
        createdBy: ACTOR,
      });
      expect(enqueuedEvents(outbox)).toEqual([
        {
          eventType: EventTypes.ADMIN_STAFF_ADDED,
          aggregateId: TARGET,
          payload: { actorUserId: ACTOR, userId: TARGET, role: "manager", source: "console" },
        },
      ]);
    });

    it("answers not found when revoking it, since it grants nothing", async () => {
      const { store, service } = setup({ target: delisted });

      expect((await service.revoke(change)).getError().code).toBe("ADMIN_STAFF_NOT_FOUND");
      expect(store.revoke).not.toHaveBeenCalled();
    });
  });

  describe("assignRole and the impersonations of the target", () => {
    const denied = {
      permission: "users.impersonate" as const,
      effect: "deny" as const,
      expiresAt: Option.none<Date>(),
    };
    const granted = { ...denied, effect: "grant" as const };

    function withOverrides(role: StaffRole, overrides: StaffRecord["overrides"]) {
      return Option.some<StaffRecord>({
        userId: TARGET,
        role,
        source: "console",
        banned: false,
        overrides,
      });
    }

    it("ends them when the new role no longer holds the permission", async () => {
      const { store, service } = setup({ target: member("support") });

      await service.assignRole({ ...change, role: "auditor" });

      expect(store.endImpersonationsBy).toHaveBeenCalledWith(TARGET);
    });

    it("keeps them when the new role still holds the permission", async () => {
      const { store, service } = setup({ target: member("support") });

      await service.assignRole({ ...change, role: "manager" });

      expect(store.endImpersonationsBy).not.toHaveBeenCalled();
    });

    it("ends them when an override denies the permission of the new role", async () => {
      const { store, service } = setup({ target: withOverrides("auditor", [denied]) });

      await service.assignRole({ ...change, role: "support" });

      expect(store.endImpersonationsBy).toHaveBeenCalledWith(TARGET);
    });

    it("keeps them when an override grants the permission the new role lacks", async () => {
      const { store, service } = setup({ target: withOverrides("support", [granted]) });

      await service.assignRole({ ...change, role: "auditor" });

      expect(store.endImpersonationsBy).not.toHaveBeenCalled();
    });

    it("rolls the role change back when they cannot be ended", async () => {
      const { store, service, outcome } = setup({ target: member("support") });
      store.endImpersonationsBy.mockImplementation(async () =>
        Result.fail({ code: "ADMIN_STAFF_PROVIDER_FAILURE", message: "down" }),
      );

      const result = await service.assignRole({ ...change, role: "auditor" });

      expect(result.isFailure).toBe(true);
      expect(outcome()).toBe("rolled_back");
    });
  });

  describe("moderate", () => {
    const allowed = async () => Result.ok<void, never>(undefined);
    const managerPermissions = ["users.moderate", "staff.manage"] as const;
    const supportPermissions = ["users.moderate"] as const;

    it("lets a moderator act on a plain user", async () => {
      const { service } = setup({});

      const result = await service.moderate(
        { actorPermissions: supportPermissions, targetUserId: TARGET },
        allowed,
      );

      expect(result.isSuccess).toBe(true);
    });

    it("refuses a moderator without staff.manage on an active staff member", async () => {
      const { service } = setup({ target: member("auditor") });
      let ran = false;

      const result = await service.moderate(
        { actorPermissions: supportPermissions, targetUserId: TARGET },
        async () => {
          ran = true;
          return Result.ok<void, never>(undefined);
        },
      );

      expect(result.getError().code).toBe("ADMIN_USER_STAFF_TARGET_FORBIDDEN");
      expect(ran).toBe(false);
    });

    it("refuses a moderator without staff.manage on a listed id with no row", async () => {
      const { service } = setup({ listed: [TARGET] });

      const result = await service.moderate(
        { actorPermissions: supportPermissions, targetUserId: TARGET },
        allowed,
      );

      expect(result.getError().code).toBe("ADMIN_USER_STAFF_TARGET_FORBIDDEN");
    });

    it("treats a de-listed row as a plain user", async () => {
      const { service } = setup({
        target: Option.some<StaffRecord>({
          userId: TARGET,
          role: "manager",
          source: "env",
          banned: false,
          overrides: [],
        }),
      });

      const result = await service.moderate(
        { actorPermissions: supportPermissions, targetUserId: TARGET },
        allowed,
      );

      expect(result.isSuccess).toBe(true);
    });

    it("lets a holder of staff.manage act on staff", async () => {
      const { service } = setup({ target: member("manager") });

      const result = await service.moderate(
        { actorPermissions: managerPermissions, targetUserId: TARGET },
        allowed,
      );

      expect(result.isSuccess).toBe(true);
    });
  });

  describe("moderateBan", () => {
    const managerPermissions = ["users.moderate", "staff.manage"] as const;
    const input = { actorPermissions: managerPermissions, targetUserId: TARGET };

    it("refuses banning the last manager and rolls back", async () => {
      const { service, outcome } = setup({
        target: member("manager"),
        managers: onlyTargetManages,
      });
      let banned = false;

      const result = await service.moderateBan(input, async () => {
        banned = true;
        return Result.ok<void, never>(undefined);
      });

      expect(result.getError().code).toBe("ADMIN_STAFF_LAST_MANAGER_FORBIDDEN");
      expect(banned).toBe(false);
      expect(outcome()).toBe("rolled_back");
    });

    it("refuses banning a listed id who is the last manager", async () => {
      const { service } = setup({ listed: [TARGET], managers: [] });

      const result = await service.moderateBan(input, async () =>
        Result.ok<void, never>(undefined),
      );

      expect(result.getError().code).toBe("ADMIN_STAFF_LAST_MANAGER_FORBIDDEN");
    });

    it("bans a manager when another one remains, under the lock", async () => {
      const { store, service } = setup({ target: member("manager") });
      let banned = false;

      const result = await service.moderateBan(input, async () => {
        banned = true;
        return Result.ok<void, never>(undefined);
      });

      expect(result.isSuccess).toBe(true);
      expect(banned).toBe(true);
      expect(store.lockActiveManagers).toHaveBeenCalled();
    });

    it("bans a plain user whoever the managers are", async () => {
      const { service } = setup({
        managers: onlyTargetManages.map((m) => ({ ...m, userId: "x" })),
      });

      const result = await service.moderateBan(
        { actorPermissions: ["users.moderate"], targetUserId: TARGET },
        async () => Result.ok<void, never>(undefined),
      );

      expect(result.isSuccess).toBe(true);
    });

    it("refuses a moderator without staff.manage before the guard", async () => {
      const { service } = setup({ target: member("support") });

      const result = await service.moderateBan(
        { actorPermissions: ["users.moderate"], targetUserId: TARGET },
        async () => Result.ok<void, never>(undefined),
      );

      expect(result.getError().code).toBe("ADMIN_USER_STAFF_TARGET_FORBIDDEN");
    });

    it("rolls back when the ban itself fails", async () => {
      const { service, outcome } = setup({});

      const result = await service.moderateBan(
        { actorPermissions: ["users.moderate"], targetUserId: TARGET },
        async () =>
          Result.fail<void, AppError<"ADMIN_ACTION_PROVIDER_FAILURE">>({
            code: "ADMIN_ACTION_PROVIDER_FAILURE",
            message: "x",
          }),
      );

      expect(result.getError().code).toBe("ADMIN_ACTION_PROVIDER_FAILURE");
      expect(outcome()).toBe("rolled_back");
    });
  });

  describe("revoke", () => {
    it("revokes a member and announces it with the actor", async () => {
      const { store, outbox, service } = setup({ target: member("support") });

      const result = await service.revoke(change);

      expect(result.isSuccess).toBe(true);
      expect(store.revoke).toHaveBeenCalledWith(TARGET);
      expect(enqueuedEvents(outbox)).toEqual([
        {
          eventType: EventTypes.ADMIN_STAFF_REVOKED,
          aggregateId: TARGET,
          payload: { actorUserId: ACTOR, userId: TARGET, role: "support" },
        },
      ]);
    });

    it("answers not found for a user who is not staff", async () => {
      const { service } = setup({});

      expect((await service.revoke(change)).getError().code).toBe("ADMIN_STAFF_NOT_FOUND");
    });

    it("refuses to revoke the last manager", async () => {
      const { store, service } = setup({ target: member("manager"), managers: onlyTargetManages });

      const result = await service.revoke(change);

      expect(result.getError().code).toBe("ADMIN_STAFF_LAST_MANAGER_FORBIDDEN");
      expect(store.revoke).not.toHaveBeenCalled();
    });

    it("does not count a manager whose env listing is gone as a remaining manager", async () => {
      const { service } = setup({
        target: member("manager"),
        managers: [...onlyTargetManages, { userId: "former", source: "env" }],
      });

      expect((await service.revoke(change)).getError().code).toBe(
        "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN",
      );
    });

    it("counts a manager still listed in the env as a remaining manager", async () => {
      const { service } = setup({
        target: member("manager"),
        managers: [...onlyTargetManages, { userId: "op", source: "env" }],
        listed: ["op"],
      });

      expect((await service.revoke(change)).isSuccess).toBe(true);
    });

    it("refuses to revoke oneself", async () => {
      const { service } = setup({});

      const result = await service.revoke({ actorUserId: ACTOR, targetUserId: ACTOR });

      expect(result.getError().code).toBe("ADMIN_STAFF_SELF_CHANGE_FORBIDDEN");
    });
  });

  describe("list", () => {
    it("hides a row whose env listing is gone, since it grants nothing", async () => {
      const row = {
        email: "a@example.com",
        name: "A",
        role: "manager" as const,
        createdAt: new Date(),
      };
      const { store, service } = setup({ listed: ["kept"] });
      store.listActive.mockImplementation(async () =>
        Result.ok([
          { ...row, userId: "kept", source: "env" as const },
          { ...row, userId: "gone", source: "env" as const },
          { ...row, userId: "hired", source: "console" as const },
        ]),
      );

      const listed = (await service.list()).getValue().map((r) => r.userId);

      expect(listed).toEqual(["kept", "hired"]);
    });
  });

  describe("what a request is refused or stamped with before it queues", () => {
    it("a timed ban is sensitive on a staff member and over a permanent ban, not otherwise", async () => {
      const timed = { targetUserId: TARGET, expiresIn: 3600 };
      const onStaff = await setup({ target: member("support") }).service.banIsSensitive(timed);
      const overPermanent = await setup({
        user: Option.some({ ...USER, banned: true }),
      }).service.banIsSensitive(timed);
      const overTimed = await setup({
        user: Option.some({ ...USER, banned: true, banExpires: Option.some(new Date()) }),
      }).service.banIsSensitive(timed);
      const onPlainUser = await setup({}).service.banIsSensitive(timed);

      expect(onStaff.getValue()).toBe(true);
      expect(overPermanent.getValue()).toBe(true);
      expect(overTimed.getValue()).toBe(false);
      expect(onPlainUser.getValue()).toBe(false);
    });

    it("refuses to queue a ban of staff from someone who cannot manage staff", async () => {
      const { service } = setup({ target: member("manager") });

      const refused = await service.refuseBan({
        actorPermissions: ["users.moderate"],
        targetUserId: TARGET,
      });

      expect(refused.getError().code).toBe("ADMIN_USER_STAFF_TARGET_FORBIDDEN");
    });

    it("refuses to queue the last manager's demotion and returns the current role otherwise", async () => {
      const last = setup({ target: member("manager"), managers: onlyTargetManages });
      const refused = await last.service.refuseRoleChange({ ...change, role: "support" });
      const open = setup({ target: member("support") });
      const from = await open.service.refuseRoleChange({ ...change, role: "manager" });

      expect(refused.getError().code).toBe("ADMIN_STAFF_LAST_MANAGER_FORBIDDEN");
      expect(from.getValue().unwrap()).toBe("support");
    });

    it("refuses to queue a revocation of someone who is not staff", async () => {
      const refused = await setup({}).service.refuseRevoke(change);

      expect(refused.getError().code).toBe("ADMIN_STAFF_NOT_FOUND");
    });
  });

  describe("assignRole from an approved request", () => {
    it("fails when the role moved since the request, so a revoked person stays out", async () => {
      const { store, service } = setup({});

      const result = await service.assignRole({
        ...change,
        role: "manager",
        expectedRole: "support",
      });

      expect(result.getError().code).toBe("ADMIN_STAFF_ROLE_CHANGED_CONFLICT");
      expect(store.assign).not.toHaveBeenCalled();
    });
  });
});

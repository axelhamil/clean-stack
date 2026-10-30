import { describe, expect, it } from "bun:test";
import type { StaffRole } from "@packages/access-control";
import { Option, Result } from "@packages/ddd-kit";
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
  role: Option.none(),
  banned: false,
  banReason: Option.none(),
  banExpires: Option.none(),
  twoFactorEnabled: false,
  createdAt: new Date("2026-01-01"),
};

function member(role: StaffRole): Option<StaffRecord> {
  return Option.some({ userId: TARGET, role, source: "console", overrides: [] });
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

  const users = mockPort<IAdminUserStore>();
  users.findUserById.mockImplementation(async () => Result.ok(given.user ?? Option.some(USER)));

  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});

  const { unitOfWork, outcome } = mockUnitOfWork();
  const service = new StaffService(store, users, outbox, unitOfWork, given.listed ?? []);

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
});

import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { enqueuedEvents } from "../../__TESTS__/enqueued-events";
import type { IOutboxRepository } from "../../ports/outbox.port";
import type { IStaffStore, StaffRecord } from "../../ports/staff-store.port";
import { StaffAccessService } from "../staff-access.service";

const LISTED = { id: "op", twoFactorEnabled: false };
const PLAIN = { id: "plain", twoFactorEnabled: true };
const SESSION = { impersonatedBy: null };
const RECORD: StaffRecord = { userId: "op", role: "support", source: "console", overrides: [] };

function setup(row: Option<StaffRecord>, inserted = true) {
  const store = mockPort<IStaffStore>();
  store.findActive.mockImplementation(async () => Result.ok(row));
  store.insertFromEnv.mockImplementation(async () => Result.ok(inserted));

  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});

  const service = new StaffAccessService(store, outbox, mockUnitOfWork().unitOfWork, {
    PLATFORM_ADMIN_IDS: ["op"],
    PLATFORM_ADMIN_REQUIRE_MFA: false,
  });

  return { store, outbox, service };
}

describe("StaffAccessService", () => {
  describe("gate", () => {
    it("inserts a listed id's row on its first request and announces it with a null actor", async () => {
      const { store, outbox, service } = setup(Option.none());

      const access = await service.gate(LISTED, SESSION);

      expect(access.getValue().unwrap().role).toBe("manager");
      expect(store.insertFromEnv).toHaveBeenCalledWith("op");
      expect(enqueuedEvents(outbox)).toEqual([
        {
          eventType: EventTypes.ADMIN_STAFF_ADDED,
          aggregateId: "op",
          payload: { actorUserId: null, userId: "op", role: "manager", source: "env" },
        },
      ]);
    });

    it("announces nothing when a concurrent request won the insert", async () => {
      const { outbox, service } = setup(Option.none(), false);

      const access = await service.gate(LISTED, SESSION);

      expect(access.getValue().isSome()).toBe(true);
      expect(enqueuedEvents(outbox)).toEqual([]);
    });

    it("writes nothing for a listed id that already has its row", async () => {
      const { store, service } = setup(Option.some(RECORD));

      await service.gate(LISTED, SESSION);

      expect(store.insertFromEnv).not.toHaveBeenCalled();
    });

    it("refuses and writes nothing for a plain user", async () => {
      const { store, service } = setup(Option.none());

      const access = await service.gate(PLAIN, SESSION);

      expect(access.getValue().isNone()).toBe(true);
      expect(store.insertFromEnv).not.toHaveBeenCalled();
    });

    it("refuses an impersonated session, so impersonating a manager grants nothing", async () => {
      const { store, service } = setup(Option.some(RECORD));

      const access = await service.gate(LISTED, { impersonatedBy: "someone" });

      expect(access.getValue().isNone()).toBe(true);
      expect(store.findActive).not.toHaveBeenCalled();
    });
  });

  describe("read", () => {
    it("reports a listed id as staff without writing its row", async () => {
      const { store, service } = setup(Option.none());

      const access = await service.read(LISTED, SESSION);

      expect(access.getValue().unwrap().role).toBe("manager");
      expect(store.insertFromEnv).not.toHaveBeenCalled();
    });

    it("reports no staff access under impersonation", async () => {
      const { service } = setup(Option.some(RECORD));

      const access = await service.read(LISTED, { impersonatedBy: "someone" });

      expect(access.getValue().isNone()).toBe(true);
    });
  });
});

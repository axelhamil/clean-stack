import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { enqueuedEvents } from "../../__TESTS__/enqueued-events";
import type { IOutboxRepository } from "../../ports/outbox.port";
import type { IStaffStore, StaffRecord } from "../../ports/staff-store.port";
import { runWithRequestContext } from "../../request-context";
import { StaffAccessService } from "../staff-access.service";

const LISTED = { id: "op", twoFactorEnabled: false };
const PLAIN = { id: "plain", twoFactorEnabled: true };
const SESSION = { impersonatedBy: null };
const RECORD: StaffRecord = { userId: "op", role: "support", source: "console", overrides: [] };

function setup(row: Option<StaffRecord>, inserted = true) {
  const store = mockPort<IStaffStore>();
  store.findActive.mockImplementation(async () => Result.ok(row));
  store.bootstrapFromEnv.mockImplementation(async () => Result.ok(inserted));

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
      expect(store.bootstrapFromEnv).toHaveBeenCalledWith("op");
      expect(enqueuedEvents(outbox)).toEqual([
        {
          eventType: EventTypes.ADMIN_STAFF_ADDED,
          aggregateId: "op",
          payload: { actorUserId: null, userId: "op", role: "manager", source: "env" },
        },
      ]);
    });

    it("revives a listed id's revoked row, announced like a first insert", async () => {
      const { store, outbox, service } = setup(Option.none());

      await service.gate(LISTED, SESSION);

      expect(store.bootstrapFromEnv).toHaveBeenCalledTimes(1);
      expect(enqueuedEvents(outbox)).toHaveLength(1);
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

      expect(store.bootstrapFromEnv).not.toHaveBeenCalled();
    });

    it("refuses and writes nothing for a plain user", async () => {
      const { store, service } = setup(Option.none());

      const access = await service.gate(PLAIN, SESSION);

      expect(access.getValue().isNone()).toBe(true);
      expect(store.bootstrapFromEnv).not.toHaveBeenCalled();
    });

    it("refuses an impersonated session, so impersonating a manager grants nothing", async () => {
      const { store, service } = setup(Option.some(RECORD));

      const access = await service.gate(LISTED, { impersonatedBy: "someone" });

      expect(access.getValue().isNone()).toBe(true);
      expect(store.findActive).not.toHaveBeenCalled();
    });
  });

  describe("per request", () => {
    it("reads the row once however many checks the request makes", async () => {
      const { store, service } = setup(Option.some(RECORD));

      await runWithRequestContext({ requestId: "r" }, async () => {
        await service.read(PLAIN, SESSION);
        await service.gate(PLAIN, SESSION);
      });

      expect(store.findActive).toHaveBeenCalledTimes(1);
    });

    it("reads again on the next request", async () => {
      const { store, service } = setup(Option.some(RECORD));

      await runWithRequestContext({ requestId: "a" }, () => service.read(PLAIN, SESSION));
      await runWithRequestContext({ requestId: "b" }, () => service.read(PLAIN, SESSION));

      expect(store.findActive).toHaveBeenCalledTimes(2);
    });
  });

  describe("impersonatorHolds", () => {
    it("is true while the impersonator holds the permission", async () => {
      const { service } = setup(Option.some(RECORD));

      expect(await service.impersonatorHolds("support")).toBe(true);
    });

    it("is false once the impersonator has no active row", async () => {
      const { service } = setup(Option.none());

      expect(await service.impersonatorHolds("revoked")).toBe(false);
    });

    it("is false once demoted to a role without the permission", async () => {
      const { service } = setup(Option.some({ ...RECORD, role: "auditor" }));

      expect(await service.impersonatorHolds("demoted")).toBe(false);
    });

    it("is false once an override denies the permission", async () => {
      const { service } = setup(
        Option.some({
          ...RECORD,
          overrides: [
            { permission: "users.impersonate", effect: "deny", expiresAt: Option.none() },
          ],
        }),
      );

      expect(await service.impersonatorHolds("denied")).toBe(false);
    });

    it("is false for an env row whose id left the list", async () => {
      const { service } = setup(
        Option.some({ ...RECORD, userId: "former", role: "manager", source: "env" }),
      );

      expect(await service.impersonatorHolds("former")).toBe(false);
    });

    it("answers a listed id without any read", async () => {
      const { store, service } = setup(Option.none());

      expect(await service.impersonatorHolds("op")).toBe(true);
      expect(store.findActive).not.toHaveBeenCalled();
    });

    it("fails closed when the read fails", async () => {
      const { store, service } = setup(Option.none());
      store.findActive.mockImplementation(async () =>
        Result.fail({ code: "ADMIN_STAFF_PROVIDER_FAILURE", message: "down" }),
      );

      expect(await service.impersonatorHolds("any")).toBe(false);
    });
  });

  describe("read", () => {
    it("reports a listed id as staff without writing its row", async () => {
      const { store, service } = setup(Option.none());

      const access = await service.read(LISTED, SESSION);

      expect(access.getValue().unwrap().role).toBe("manager");
      expect(store.bootstrapFromEnv).not.toHaveBeenCalled();
    });

    it("reports no staff access under impersonation", async () => {
      const { service } = setup(Option.some(RECORD));

      const access = await service.read(LISTED, { impersonatedBy: "someone" });

      expect(access.getValue().isNone()).toBe(true);
    });
  });
});

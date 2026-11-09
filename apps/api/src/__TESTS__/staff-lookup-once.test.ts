import { describe, expect, it } from "bun:test";
import type { IStaffStore, StaffRecord } from "@modules/admin/application/ports/staff-store.port";
import { StaffAccessService } from "@modules/admin/application/services/staff-access.service";
import { Option, Result } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { runWithRequestContext, staffLookupOnce } from "../shared/request-context";

const PLAIN = { id: "plain", twoFactorEnabled: true };
const SESSION = { impersonatedBy: null };
const RECORD: StaffRecord = {
  userId: "op",
  role: "support",
  source: "console",
  banned: false,
  overrides: [],
};

function setup() {
  const store = mockPort<IStaffStore>();
  store.findActive.mockImplementation(async () => Result.ok(Option.some(RECORD)));

  const service = new StaffAccessService(
    store,
    mockPort<IOutboxRepository>(),
    mockUnitOfWork().unitOfWork,
    { PLATFORM_ADMIN_IDS: ["op"], PLATFORM_ADMIN_REQUIRE_MFA: false },
    staffLookupOnce,
  );

  return { store, service };
}

describe("StaffAccessService bound to the request context", () => {
  it("reads the row once however many checks the request makes", async () => {
    const { store, service } = setup();

    await runWithRequestContext({ requestId: "r" }, async () => {
      await service.read(PLAIN, SESSION);
      await service.gate(PLAIN, SESSION);
    });

    expect(store.findActive).toHaveBeenCalledTimes(1);
  });

  it("reads again on the next request", async () => {
    const { store, service } = setup();

    await runWithRequestContext({ requestId: "a" }, () => service.read(PLAIN, SESSION));
    await runWithRequestContext({ requestId: "b" }, () => service.read(PLAIN, SESSION));

    expect(store.findActive).toHaveBeenCalledTimes(2);
  });
});

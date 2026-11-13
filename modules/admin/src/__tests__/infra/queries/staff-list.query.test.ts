import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type {
  IStaffStore,
  StaffRecord,
} from "../../../application/ports/repositories/staff-store.port";
import { StaffListQuery } from "../../../infra/queries/list-staff.query";
import { StaffOverrideListQuery } from "../../../infra/queries/list-staff-overrides.query";

const ENV = { PLATFORM_ADMIN_IDS: ["kept"] };

function record(userId: string, source: StaffRecord["source"]): StaffRecord {
  return { userId, role: "manager", source, banned: false, overrides: [] };
}

describe("StaffListQuery", () => {
  it("given a row whose env listing is gone, when listed, then it is hidden since it grants nothing", async () => {
    const store = mockPort<IStaffStore>();
    const row = {
      email: "a@example.com",
      name: "A",
      role: "manager" as const,
      createdAt: new Date(),
    };
    store.listActive.mockImplementation(async () =>
      Result.ok([
        { ...row, userId: "kept", source: "env" as const },
        { ...row, userId: "gone", source: "env" as const },
        { ...row, userId: "hired", source: "console" as const },
      ]),
    );

    const listed = await new StaffListQuery(store, ENV, mockInstrumentation()).execute();

    expect(listed.getValue().map((r) => r.userId)).toEqual(["kept", "hired"]);
  });
});

describe("StaffOverrideListQuery", () => {
  function setup(found: Option<StaffRecord>) {
    const store = mockPort<IStaffStore>();
    store.findActive.mockImplementation(async () => Result.ok(found));
    store.listLiveOverrides.mockImplementation(async () => Result.ok([]));

    return { store, query: new StaffOverrideListQuery(store, ENV, mockInstrumentation()) };
  }

  it("given a staff member, when listed, then their live overrides come back", async () => {
    const { store, query } = setup(Option.some(record("hired", "console")));

    const result = await query.execute({ userId: "hired" });

    expect(result.getValue().isSome()).toBe(true);
    expect(store.listLiveOverrides).toHaveBeenCalledWith("hired");
  });

  it("given an env row whose listing is gone, when listed, then nobody is found and no override is read", async () => {
    const { store, query } = setup(Option.some(record("gone", "env")));

    const result = await query.execute({ userId: "gone" });

    expect(result.getValue().isNone()).toBe(true);
    expect(store.listLiveOverrides).not.toHaveBeenCalled();
  });
});

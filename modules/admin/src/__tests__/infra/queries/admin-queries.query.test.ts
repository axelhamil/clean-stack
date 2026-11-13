import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type {
  AdminOrgListRow,
  IAdminOrgStore,
} from "../../../application/ports/repositories/admin-org-store.port";
import type {
  AdminSessionRow,
  AdminStoreError,
  AdminUserListRow,
  IAdminUserStore,
  UnbanOutcome,
} from "../../../application/ports/repositories/admin-user-store.port";
import type {
  ActivePlanOverride,
  IPlanOverrideReader,
} from "../../../application/ports/repositories/plan-override.port";
import type { EndedSessions } from "../../../application/ports/repositories/staff-store.port";
import type { IEntitlementsReader } from "../../../application/ports/services/entitlements-reader.port";
import { AdminOrgDetailQuery } from "../../../infra/queries/get-org.query";
import { AdminUserDetailQuery } from "../../../infra/queries/get-user.query";
import { AdminOrgListQuery } from "../../../infra/queries/list-orgs.query";
import { AdminUserListQuery } from "../../../infra/queries/list-users.query";

const USER: AdminUserListRow = {
  id: "u-1",
  email: "a@example.com",
  name: "A",
  banned: false,
  banReason: Option.none(),
  banExpires: Option.none(),
  twoFactorEnabled: true,
  createdAt: new Date("2026-01-01"),
  cursorAt: "2026-01-01 00:00:00.123456",
};

const ORG: AdminOrgListRow = {
  id: "o-1",
  name: "Acme",
  slug: "acme",
  memberCount: 3,
  createdAt: new Date("2026-01-01"),
  cursorAt: "2026-01-01 00:00:00.123456",
  ssoEnforced: false,
};

const STORE_FAILURE: AdminStoreError = {
  code: "ADMIN_QUERY_PROVIDER_FAILURE",
  message: "db down",
};

const ok = <T>(value: T) => Result.ok<T, AdminStoreError>(value);
const failed = <T>() => Result.fail<T, AdminStoreError>(STORE_FAILURE);

function userStore(overrides: Partial<IAdminUserStore> = {}): IAdminUserStore {
  return {
    listUsers: mock(async () => ok([USER])),
    findUserById: mock(async () => ok(Option.some(USER))),
    listSessionsFor: mock(async () => ok([])),
    listMembershipsFor: mock(async () => ok([])),
    ban: mock(async () => ok(Option.none<EndedSessions>())),
    unban: mock(async () => ok<UnbanOutcome>("not_found")),
    deleteSessions: mock(async () => ok({ sessions: [], impersonations: [] })),
    ...overrides,
  };
}

function orgStore(overrides: Partial<IAdminOrgStore> = {}): IAdminOrgStore {
  return {
    listOrgs: mock(async () => ok([ORG])),
    findOrgById: mock(async () => ok(Option.some(ORG))),
    listMembersOf: mock(async () => ok([])),
    ...overrides,
  };
}

const PRO_VIEW = { tier: "pro" };

function entitlementsReader(
  read: IEntitlementsReader["readEntitlements"] = async () => Result.ok(PRO_VIEW),
): IEntitlementsReader {
  return { readEntitlements: mock(read) };
}

function overrideStore(active: Option<ActivePlanOverride> = Option.none()): IPlanOverrideReader {
  const store = mockPort<IPlanOverrideReader>();
  store.findActive.mockImplementation(async () => Result.ok(active));

  return store;
}

function queries(
  users = userStore(),
  orgs = orgStore(),
  overrides = overrideStore(),
  entitlements = entitlementsReader(),
) {
  const instrumentation = mockInstrumentation();

  return {
    users: new AdminUserListQuery(users, instrumentation),
    orgs: new AdminOrgListQuery(orgs, instrumentation),
    user: new AdminUserDetailQuery(users, instrumentation),
    org: new AdminOrgDetailQuery(orgs, entitlements, overrides, instrumentation),
  };
}

describe("admin queries", () => {
  describe("AdminUserListQuery", () => {
    it("returns the store rows as page items", async () => {
      const page = (await queries().users.execute({ limit: 50 })).getValue();

      expect(page.items[0]?.banReason.isNone()).toBe(true);
    });

    it("returns no cursor when the page is not full", async () => {
      const page = (await queries().users.execute({ limit: 50 })).getValue();

      expect(page.nextCursor.isNone()).toBe(true);
    });

    it("returns the exact instant and id of the last row as cursor when the page is exactly full", async () => {
      const page = (await queries().users.execute({ limit: 1 })).getValue();

      expect(page.nextCursor.unwrap()).toBe("2026-01-01 00:00:00.123456~u-1");
    });

    it("passes the organizationId filter through to the store", async () => {
      const users = userStore();

      await queries(users).users.execute({ limit: 50, organizationId: "org-1" });

      expect(users.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" }),
      );
    });

    it("propagates a store failure", async () => {
      const users = userStore({ listUsers: mock(async () => failed<AdminUserListRow[]>()) });

      const result = await queries(users).users.execute({ limit: 50 });

      expect(result.getError()).toEqual(STORE_FAILURE);
    });
  });

  describe("AdminUserDetailQuery", () => {
    it("returns none when the user does not exist", async () => {
      const users = userStore({
        findUserById: mock(async () => ok(Option.none<AdminUserListRow>())),
      });

      const result = await queries(users).user.execute({ userId: "missing" });

      expect(result.getValue().isNone()).toBe(true);
      expect(users.listSessionsFor).not.toHaveBeenCalled();
    });

    it("assembles sessions and memberships for an existing user", async () => {
      const users = userStore({
        listSessionsFor: mock(async () =>
          ok([
            {
              id: "s-1",
              createdAt: new Date("2026-02-01"),
              cursorAt: "2026-02-01 00:00:00",
              expiresAt: new Date("2026-02-02"),
              ipAddress: Option.some("1.2.3.4"),
              userAgent: Option.none<string>(),
              impersonatedBy: Option.some("admin-1"),
            },
          ]),
        ),
        listMembershipsFor: mock(async () =>
          ok([{ organizationId: "o-1", organizationName: "Acme", role: "owner" }]),
        ),
      });

      const detail = (await queries(users).user.execute({ userId: "u-1" })).getValue().unwrap();

      expect(detail.sessions[0]?.impersonatedBy.unwrap()).toBe("admin-1");
      expect(detail.memberships[0]?.organizationName).toBe("Acme");
    });

    it("fails when a related lookup fails", async () => {
      const users = userStore({ listSessionsFor: mock(async () => failed<AdminSessionRow[]>()) });

      const result = await queries(users).user.execute({ userId: "u-1" });

      expect(result.isFailure).toBe(true);
    });
  });

  describe("AdminOrgListQuery", () => {
    it("lists orgs with their member count", async () => {
      const page = (await queries().orgs.execute({ limit: 50 })).getValue();

      expect(page.items[0]?.memberCount).toBe(3);
    });
  });

  describe("AdminOrgDetailQuery", () => {
    it("returns none for an unknown org", async () => {
      const orgs = orgStore({ findOrgById: mock(async () => ok(Option.none<AdminOrgListRow>())) });

      const result = await queries(userStore(), orgs).org.execute({ organizationId: "nope" });

      expect(result.getValue().isNone()).toBe(true);
    });

    it("surfaces a failed plan read instead of showing the org as free", async () => {
      const result = await queries(
        userStore(),
        orgStore(),
        overrideStore(),
        entitlementsReader(async () =>
          Result.fail({ code: "BILLING_PROVIDER_FAILURE", message: "db down" }),
        ),
      ).org.execute({ organizationId: "o-1" });

      expect(result.getError().code).toBe("BILLING_PROVIDER_FAILURE");
    });

    it("shows the plan the gates apply and the override behind it", async () => {
      const active: ActivePlanOverride = {
        id: "ov-1",
        organizationId: "o-1",
        tier: "pro",
        expiresAt: new Date("2030-01-01"),
        note: "Pilot",
        createdAt: new Date("2026-01-01"),
      };

      const detail = (
        await queries(userStore(), orgStore(), overrideStore(Option.some(active))).org.execute({
          organizationId: "o-1",
        })
      )
        .getValue()
        .unwrap();

      expect(detail.plan).toBe("pro");
      expect(detail.planOverride.unwrap().expiresAt).toEqual(active.expiresAt);
    });
  });
});

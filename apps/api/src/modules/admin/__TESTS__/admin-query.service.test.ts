import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type { AdminOrgRow, IAdminOrgStore } from "../application/ports/admin-org-store.port";
import type {
  AdminSessionRow,
  AdminStoreError,
  AdminUserRow,
  IAdminUserStore,
} from "../application/ports/admin-user-store.port";
import { AdminQueryService } from "../application/services/admin-query.service";

const USER: AdminUserRow = {
  id: "u-1",
  email: "a@example.com",
  name: "A",
  role: Option.some("admin"),
  banned: false,
  banReason: Option.none(),
  banExpires: Option.none(),
  twoFactorEnabled: true,
  createdAt: new Date("2026-01-01"),
};

const ORG: AdminOrgRow = {
  id: "o-1",
  name: "Acme",
  slug: "acme",
  memberCount: 3,
  createdAt: new Date("2026-01-01"),
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
    ...overrides,
  };
}

function orgStore(overrides: Partial<IAdminOrgStore> = {}): IAdminOrgStore {
  return {
    listOrgs: mock(async () => ok([ORG])),
    findOrgById: mock(async () => ok(Option.some(ORG))),
    listMembersOf: mock(async () => ok([])),
    findPlanFor: mock(async () => ok(Option.none<string>())),
    ...overrides,
  };
}

function service(users = userStore(), orgs = orgStore()) {
  return new AdminQueryService(users, new NoOpInstrumentation(), orgs);
}

describe("AdminQueryService", () => {
  describe("listUsers", () => {
    it("returns the store rows as page items", async () => {
      const page = (await service().listUsers({ limit: 50 })).getValue();

      expect(page.items[0]?.role.unwrap()).toBe("admin");
      expect(page.items[0]?.banReason.isNone()).toBe(true);
    });

    it("returns no cursor when the page is not full", async () => {
      const page = (await service().listUsers({ limit: 50 })).getValue();

      expect(page.nextCursor.isNone()).toBe(true);
    });

    it("returns the last createdAt as cursor when the page is exactly full", async () => {
      const page = (await service().listUsers({ limit: 1 })).getValue();

      expect(page.nextCursor.unwrap()).toBe(new Date("2026-01-01").toISOString());
    });

    it("passes the organizationId filter through to the store", async () => {
      const users = userStore();

      await service(users).listUsers({ limit: 50, organizationId: "org-1" });

      expect(users.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" }),
      );
    });

    it("propagates a store failure", async () => {
      const users = userStore({ listUsers: mock(async () => failed<AdminUserRow[]>()) });

      const result = await service(users).listUsers({ limit: 50 });

      expect(result.getError()).toEqual(STORE_FAILURE);
    });
  });

  describe("getUser", () => {
    it("returns none when the user does not exist", async () => {
      const users = userStore({ findUserById: mock(async () => ok(Option.none<AdminUserRow>())) });

      const result = await service(users).getUser("missing");

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

      const detail = (await service(users).getUser("u-1")).getValue().unwrap();

      expect(detail.sessions[0]?.impersonatedBy.unwrap()).toBe("admin-1");
      expect(detail.memberships[0]?.organizationName).toBe("Acme");
    });

    it("fails when a related lookup fails", async () => {
      const users = userStore({ listSessionsFor: mock(async () => failed<AdminSessionRow[]>()) });

      const result = await service(users).getUser("u-1");

      expect(result.isFailure).toBe(true);
    });
  });

  describe("listOrgs", () => {
    it("lists orgs with their member count", async () => {
      const page = (await service().listOrgs({ limit: 50 })).getValue();

      expect(page.items[0]?.memberCount).toBe(3);
    });
  });

  describe("getOrg", () => {
    it("returns none for an unknown org", async () => {
      const orgs = orgStore({ findOrgById: mock(async () => ok(Option.none<AdminOrgRow>())) });

      const result = await service(userStore(), orgs).getOrg("nope");

      expect(result.getValue().isNone()).toBe(true);
    });

    it("exposes the plan as an Option when the org has no subscription", async () => {
      const orgs = orgStore({
        listMembersOf: mock(async () =>
          ok([{ userId: "u-1", email: "a@example.com", role: "owner" }]),
        ),
      });

      const detail = (await service(userStore(), orgs).getOrg("o-1")).getValue().unwrap();

      expect(detail.plan.isNone()).toBe(true);
      expect(detail.members).toHaveLength(1);
    });
  });
});

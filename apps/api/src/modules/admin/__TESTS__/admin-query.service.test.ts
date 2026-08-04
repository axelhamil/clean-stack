import { describe, expect, it, mock } from "bun:test";

const rows = [
  {
    id: "u-1",
    email: "a@example.com",
    name: "A",
    role: "admin",
    banned: false,
    banReason: null,
    banExpires: null,
    twoFactorEnabled: true,
    createdAt: new Date("2026-01-01"),
  },
];

mock.module("@packages/drizzle", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({ toSQL: () => ({ sql: "SELECT 1" }), execute: async () => [] }),
          }),
        }),
      }),
    }),
    insert: () => ({}),
    update: () => ({}),
    delete: () => ({}),
  },
  authSchema: {
    user: {
      id: {},
      email: {},
      name: {},
      role: {},
      banned: {},
      banReason: {},
      banExpires: {},
      twoFactorEnabled: {},
      createdAt: {},
    },
    session: {},
  },
  multiTenantSchema: { organization: {}, member: { userId: {}, organizationId: {} } },
  outboxSchema: {},
  auditLogSchema: {},
  webhooksSchema: {},
  and: (..._a: unknown[]) => ({}),
  or: (..._a: unknown[]) => ({}),
  eq: (..._a: unknown[]) => ({}),
  lt: (..._a: unknown[]) => ({}),
  inArray: (..._a: unknown[]) => ({}),
  isNull: (..._a: unknown[]) => ({}),
  isNotNull: (..._a: unknown[]) => ({}),
  ilike: (..._a: unknown[]) => ({}),
  desc: (..._a: unknown[]) => ({}),
  count: (..._a: unknown[]) => ({}),
  sql: Object.assign((_s: TemplateStringsArray, ..._v: unknown[]) => ({}), { raw: () => ({}) }),
}));

const { AdminQueryService } = await import("../application/services/admin-query.service");

const instrumentation = {
  startSpan: <T>(_o: unknown, fn: () => T) => fn(),
  capture: mock(() => {}),
  addBreadcrumb: mock(() => {}),
};

function serviceReturning(result: unknown[]) {
  const store = {
    listUsers: mock(async () => result),
  };
  return new AdminQueryService(store as never, instrumentation as never);
}

describe("AdminQueryService", () => {
  describe("listUsers", () => {
    it("returns the page items with Option-wrapped nullable columns", async () => {
      const service = serviceReturning(rows);
      const result = await service.listUsers({ limit: 50 });
      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.items[0]?.role.unwrap()).toBe("admin");
      expect(page.items[0]?.banReason.isNone()).toBe(true);
    });

    it("returns no cursor when the page is not full", async () => {
      const service = serviceReturning(rows);
      const page = (await service.listUsers({ limit: 50 })).getValue();
      expect(page.nextCursor.isNone()).toBe(true);
    });

    it("returns a cursor when the page is exactly full", async () => {
      const service = serviceReturning(rows);
      const page = (await service.listUsers({ limit: 1 })).getValue();
      expect(page.nextCursor.isSome()).toBe(true);
      expect(page.nextCursor.unwrap()).toBe(rows[0]!.createdAt.toISOString());
    });

    it("passes organizationId filter through to the store", async () => {
      const store = { listUsers: mock(async () => rows) };
      const service = new AdminQueryService(store as never, instrumentation as never);
      await service.listUsers({ limit: 50, organizationId: "org-1" });
      expect(store.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" }),
      );
    });

    it("captures the error and fails when the store throws", async () => {
      const store = {
        listUsers: mock(async () => {
          throw new Error("boom");
        }),
      };
      const service = new AdminQueryService(store as never, instrumentation as never);
      const result = await service.listUsers({ limit: 50 });
      expect(result.isFailure).toBe(true);
      expect(instrumentation.capture).toHaveBeenCalled();
    });
  });
});

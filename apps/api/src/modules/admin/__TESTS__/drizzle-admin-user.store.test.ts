import { beforeEach, describe, expect, it, mock } from "bun:test";

let dbBehavior: () => Promise<unknown[]> = async () => [];
let capturedInArrayCallCount = 0;

function buildQuery(result: () => Promise<unknown[]>) {
  const q: Record<string, unknown> = {
    toSQL: () => ({ sql: "SELECT 1", params: [] }),
    execute: result,
  };
  for (const m of [
    "select",
    "from",
    "where",
    "limit",
    "orderBy",
    "innerJoin",
    "leftJoin",
    "insert",
    "update",
    "delete",
    "values",
    "set",
    "returning",
    "for",
  ]) {
    q[m] = () => buildQuery(result);
  }
  return q;
}

function makeDbQuery() {
  return buildQuery(async () => dbBehavior());
}

mock.module("@packages/drizzle", () => ({
  db: {
    select: () => makeDbQuery(),
    insert: () => makeDbQuery(),
    update: () => makeDbQuery(),
    delete: () => makeDbQuery(),
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
  multiTenantSchema: {
    member: { userId: {}, organizationId: {} },
    organization: {},
  },
  outboxSchema: {},
  auditLogSchema: {},
  webhooksSchema: {},
  and: (..._a: unknown[]) => ({}),
  or: (..._a: unknown[]) => ({}),
  eq: (..._a: unknown[]) => ({}),
  lt: (..._a: unknown[]) => ({}),
  inArray: (..._a: unknown[]) => {
    capturedInArrayCallCount++;
    return {};
  },
  isNull: (..._a: unknown[]) => ({}),
  isNotNull: (..._a: unknown[]) => ({}),
  ilike: (..._a: unknown[]) => ({}),
  desc: (..._a: unknown[]) => ({}),
  count: (..._a: unknown[]) => ({}),
  sql: Object.assign((_s: TemplateStringsArray, ..._v: unknown[]) => ({}), { raw: () => ({}) }),
}));

const { DrizzleAdminUserStore } = await import(
  "../infrastructure/repositories/drizzle-admin-user.store"
);
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");

const fakeRow = {
  id: "u-1",
  email: "a@example.com",
  name: "A",
  role: "admin",
  banned: false,
  banReason: null,
  banExpires: null,
  twoFactorEnabled: true,
  createdAt: new Date("2026-01-01"),
};

describe("DrizzleAdminUserStore", () => {
  let store: InstanceType<typeof DrizzleAdminUserStore>;

  beforeEach(() => {
    store = new DrizzleAdminUserStore(new NoOpInstrumentation());
    dbBehavior = async () => [];
    capturedInArrayCallCount = 0;
  });

  describe("listUsers", () => {
    it("returns rows from the db", async () => {
      dbBehavior = async () => [fakeRow];
      const rows = await store.listUsers({ limit: 50 });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe("u-1");
    });

    it("applies the organization filter via inArray when organizationId is set", async () => {
      await store.listUsers({ limit: 50, organizationId: "org-1" });
      expect(capturedInArrayCallCount).toBe(1);
    });

    it("omits the inArray condition when organizationId is absent", async () => {
      await store.listUsers({ limit: 50 });
      expect(capturedInArrayCallCount).toBe(0);
    });
  });
});

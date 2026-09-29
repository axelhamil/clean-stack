import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

type SqlMarker = { _op: string; args: unknown[] };
const mk =
  (op: string) =>
  (...args: unknown[]): SqlMarker => ({ _op: op, args });

let dbBehavior: () => Promise<unknown[]> = async () => [];
let capturedWhereArgs: unknown[] = [];

function buildQuery(result: () => Promise<unknown[]>) {
  const q: Record<string, unknown> = {
    toSQL: () => ({ sql: "SELECT 1", params: [] }),
    execute: result,
    where: (arg: unknown) => {
      capturedWhereArgs.push(arg);
      return buildQuery(result);
    },
  };
  for (const m of [
    "select",
    "from",
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

// Only what this file's subject actually touches: test files do not share a module
// registry, so this replacement is invisible to every other file (see shared/CLAUDE.md).
mock.module("@packages/drizzle", () => ({
  db: {
    select: () => makeDbQuery(),
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
    organization: { id: {} },
  },
  and: mk("and"),
  or: mk("or"),
  eq: mk("eq"),
  lt: mk("lt"),
  inArray: mk("inArray"),
  ilike: mk("ilike"),
  desc: mk("desc"),
}));

const { DrizzleAdminUserStore } = await import(
  "../infrastructure/repositories/drizzle-admin-user.store"
);
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");

type InstrType = InstanceType<typeof NoOpInstrumentation>;

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
  let instrumentation: InstrType;
  let store: InstanceType<typeof DrizzleAdminUserStore>;

  beforeEach(() => {
    instrumentation = new NoOpInstrumentation();
    store = new DrizzleAdminUserStore(instrumentation);
    dbBehavior = async () => [];
    capturedWhereArgs = [];
  });

  describe("listUsers", () => {
    it("maps db rows, turning nullable columns into Options", async () => {
      dbBehavior = async () => [fakeRow];
      const rows = (await store.listUsers({ limit: 50 })).getValue();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe("u-1");
      expect(rows[0]?.role.unwrap()).toBe("admin");
      expect(rows[0]?.banReason.isNone()).toBe(true);
    });

    it("passes and(inArray(...)) to .where() when organizationId is set", async () => {
      await store.listUsers({ limit: 50, organizationId: "org-1" });
      const mainArg = capturedWhereArgs.at(-1) as SqlMarker;
      expect(mainArg).toBeDefined();
      expect(mainArg._op).toBe("and");
      const hasInArray = mainArg.args.some((a) => (a as SqlMarker)?._op === "inArray");
      expect(hasInArray).toBe(true);
    });

    it("passes undefined to .where() when organizationId is absent", async () => {
      await store.listUsers({ limit: 50 });
      expect(capturedWhereArgs.at(-1)).toBeUndefined();
    });

    it("emits outer and inner db.query spans", async () => {
      const spy = spyOn(instrumentation, "startSpan");
      await store.listUsers({ limit: 50 });
      const calls = spy.mock.calls;
      const outer = calls.find((c) => c[0]?.name === "DrizzleAdminUserStore > listUsers");
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner).toBeDefined();
      expect(inner?.[0]?.attributes?.["db.system.name"]).toBe("postgresql");
    });

    it("captures the error and returns a failure when the db fails", async () => {
      const boom = new Error("db boom");
      const captureSpy = spyOn(instrumentation, "capture");
      let callCount = 0;
      spyOn(instrumentation, "startSpan").mockImplementation(((_opts: unknown, cb: unknown) => {
        callCount++;
        if (callCount === 2) throw boom;
        return (cb as () => Promise<unknown>)();
      }) as typeof instrumentation.startSpan);

      const result = await store.listUsers({ limit: 50 });
      expect(result.getError().code).toBe("ADMIN_QUERY_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });
});

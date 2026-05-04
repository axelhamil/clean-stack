import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

let nextRoleRows: Array<{ role: string }> = [];

mock.module("@packages/drizzle", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(nextRoleRows),
      }),
    }),
  },
  eq: () => ({}),
  and: () => ({}),
  schema: { member: { role: {}, organizationId: {}, userId: {} } },
}));

const { requireOrg, requireOrgPermission } = await import("../middleware/org.middleware");

type TestEnv = {
  Variables: {
    session: { activeOrganizationId: string | null } | null;
    user: { id: string };
    orgId: string;
  };
};

function buildApp(opts: {
  session?: { activeOrganizationId: string | null } | null;
  orgIdPreset?: string;
  user?: { id: string };
  middleware: ReturnType<typeof requireOrgPermission> | typeof requireOrg;
}) {
  return new Hono<TestEnv>()
    .use("*", async (c, next) => {
      if (opts.session !== undefined) c.set("session", opts.session);
      if (opts.orgIdPreset !== undefined) c.set("orgId", opts.orgIdPreset);
      if (opts.user !== undefined) c.set("user", opts.user);
      await next();
    })
    .use("*", opts.middleware)
    .get("/test", (c) => c.json({ ok: true, orgId: c.get("orgId") }));
}

describe("requireOrg", () => {
  it("should set orgId on context when session has an activeOrganizationId", async () => {
    const res = await buildApp({
      session: { activeOrganizationId: "org-123" },
      middleware: requireOrg,
    }).request("/test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, orgId: "org-123" });
  });

  it("should reject with 403 when no active organization is in session", async () => {
    const res = await buildApp({
      session: { activeOrganizationId: null },
      middleware: requireOrg,
    }).request("/test");
    expect(res.status).toBe(403);
  });
});

describe("requireOrgPermission", () => {
  it("should reject with 403 when the role lacks the requested capability (wire test: loadRole → authorizeRole → 403)", async () => {
    nextRoleRows = [{ role: "member" }];
    const res = await buildApp({
      orgIdPreset: "org-123",
      user: { id: "user-1" },
      middleware: requireOrgPermission({ organization: ["delete"] }),
    }).request("/test");
    expect(res.status).toBe(403);
  });

  it("should fail with 500 when chained without requireOrg first (orgId missing — wiring guard)", async () => {
    const res = await buildApp({
      user: { id: "user-1" },
      middleware: requireOrgPermission({ organization: ["leave"] }),
    }).request("/test");
    expect(res.status).toBe(500);
  });
});

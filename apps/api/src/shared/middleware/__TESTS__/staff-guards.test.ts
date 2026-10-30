import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import type { StaffStoreError } from "../../ports/staff-store.port";
import { NoOpInstrumentation } from "../../services/noop-instrumentation";
import type { StaffAccess } from "../../staff-access";
import { createErrorHandler } from "../error.middleware";
import { staffGuards } from "../staff-guards";

type Decision = Result<Option<StaffAccess>, StaffStoreError>;

function appFor(decision: Decision) {
  const { requireStaff, requireStaffPermission } = staffGuards(() => ({
    gate: async () => decision,
  }));
  const app = new Hono()
    .get("/staff", requireStaff, (c) => c.json(c.get("staff")))
    .get("/audit", requireStaffPermission("audit.read"), (c) => c.json({ ok: true }));
  app.onError(createErrorHandler(new NoOpInstrumentation()));

  return app;
}

const granted = (mfaOk: boolean) =>
  Result.ok<Option<StaffAccess>, StaffStoreError>(
    Option.some({ role: "auditor", permissions: ["audit.read"], mfaOk }),
  );

const denied: Decision = Result.ok(Option.none());

async function codeOf(res: Response): Promise<unknown> {
  const body: unknown = await res.json();
  return body;
}

describe("staff guards", () => {
  it("refuses a user who is not staff", async () => {
    const res = await appFor(denied).request("/staff");

    expect(res.status).toBe(403);
    expect(await codeOf(res)).toMatchObject({ error: { code: "ADMIN_STAFF_FORBIDDEN" } });
  });

  it("refuses staff who miss the required MFA, even with the permission", async () => {
    const res = await appFor(granted(false)).request("/audit");

    expect(res.status).toBe(403);
    expect(await codeOf(res)).toMatchObject({ error: { code: "ADMIN_STAFF_MFA_FORBIDDEN" } });
  });

  it("refuses staff without the permission", async () => {
    const { requireStaffPermission } = staffGuards(() => ({ gate: async () => granted(true) }));
    const app = new Hono().get("/ban", requireStaffPermission("users.moderate"), (c) =>
      c.json({ ok: true }),
    );
    app.onError(createErrorHandler(new NoOpInstrumentation()));

    const res = await app.request("/ban");

    expect(res.status).toBe(403);
    expect(await codeOf(res)).toMatchObject({
      error: { code: "ADMIN_STAFF_PERMISSION_FORBIDDEN" },
    });
  });

  it("passes staff holding the permission", async () => {
    expect((await appFor(granted(true)).request("/audit")).status).toBe(200);
  });

  it("exposes the resolved access to the handler", async () => {
    const res = await appFor(granted(true)).request("/staff");

    expect(await res.json()).toMatchObject({ role: "auditor" });
  });

  it("surfaces a store failure instead of letting the request through", async () => {
    const failed: Decision = Result.fail({
      code: "ADMIN_STAFF_PROVIDER_FAILURE",
      message: "db down",
    });

    expect((await appFor(failed).request("/staff")).status).toBe(502);
  });
});

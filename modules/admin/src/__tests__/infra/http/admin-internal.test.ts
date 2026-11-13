import { beforeEach, describe, expect, it } from "bun:test";
import { type ILogger, Result } from "@packages/ddd-kit";
import type { SweepSpans } from "@packages/drizzle/sweep-span";
import { createErrorHandler } from "@packages/http/error-handler";
import type { RouteGuard } from "@packages/http/route-guards";
import type { RetentionPass } from "@packages/http/sweep-runner";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  type AdminInternalRoutesDeps,
  createAdminInternalRoutes,
} from "../../../infra/http/routes/admin-internal/admin-internal";

let expireApprovals = mockPort<AdminInternalRoutesDeps["ExpireApprovalsUseCase"]>();
let dueApprovals = mockPort<AdminInternalRoutesDeps["ICountDueApprovalsQuery"]>();
let expireImpersonations = mockPort<AdminInternalRoutesDeps["ExpireImpersonationsUseCase"]>();
let expiredImpersonations = mockPort<AdminInternalRoutesDeps["ICountExpiredImpersonationsQuery"]>();
let ran: { label: string; passes: RetentionPass[] }[] = [];

beforeEach(() => {
  expireApprovals = mockPort<AdminInternalRoutesDeps["ExpireApprovalsUseCase"]>();
  dueApprovals = mockPort<AdminInternalRoutesDeps["ICountDueApprovalsQuery"]>();
  expireImpersonations = mockPort<AdminInternalRoutesDeps["ExpireImpersonationsUseCase"]>();
  expiredImpersonations = mockPort<AdminInternalRoutesDeps["ICountExpiredImpersonationsQuery"]>();
  ran = [];
});

const runSweep: AdminInternalRoutesDeps["runSweep"] = async ({ label, passes }) => {
  ran.push({ label, passes: passes(mockPort<SweepSpans>()) });

  return {
    deleted: 0,
    durationMs: 0,
    dryRun: false,
    batchCount: 0,
    deletedPerPass: {},
    stopReasons: {},
    truncated: false,
    skipped: false,
  };
};

const refuseUnsigned: RouteGuard = async (c, next) => {
  if (c.req.header("x-signed") !== "yes") throw new HTTPException(401, { message: "unsigned" });
  await next();
};

function app() {
  const internal = new Hono<{ Variables: { requestId: string } }>()
    .use("*", async (c, next) => {
      c.set("requestId", "req-test");
      await next();
    })
    .route(
      "/internal",
      createAdminInternalRoutes({
        internalGuards: [refuseUnsigned],
        runSweep,
        ExpireApprovalsUseCase: expireApprovals,
        ICountDueApprovalsQuery: dueApprovals,
        ExpireImpersonationsUseCase: expireImpersonations,
        ICountExpiredImpersonationsQuery: expiredImpersonations,
      }),
    );
  internal.onError(
    createErrorHandler({
      instrumentation: mockInstrumentation(),
      logger: mockPort<ILogger>(),
      isProduction: false,
    }),
  );

  return internal;
}

function sweep(path: string, signed = true) {
  return app().request(`/internal/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(signed ? { "x-signed": "yes" } : {}) },
    body: JSON.stringify({}),
  });
}

describe("internal admin sweeps", () => {
  it("refuses a request the internal guards reject", async () => {
    const res = await sweep("sweep-admin-approvals", false);

    expect(res.status).toBe(401);
    expect(ran).toEqual([]);
  });

  it("expires due approvals in batches and counts what is left", async () => {
    expireApprovals.execute.mockResolvedValue(Result.ok(3));
    dueApprovals.execute.mockResolvedValue(Result.ok(7));

    const res = await sweep("sweep-admin-approvals");

    expect(res.status).toBe(200);
    const [run] = ran;
    expect(run?.label).toBe("sweep-admin-approvals");
    const [pass] = run?.passes ?? [];
    expect(await pass?.purgeBatch(new Date(), 50)).toBe(3);
    expect(expireApprovals.execute).toHaveBeenCalledWith({ batchSize: 50 });
    expect(await pass?.countEligible(new Date())).toBe(7);
  });

  it("ends expired impersonations in batches and counts what is left", async () => {
    expireImpersonations.execute.mockResolvedValue(Result.ok(2));
    expiredImpersonations.execute.mockResolvedValue(Result.ok(5));

    const res = await sweep("sweep-admin-impersonations");

    expect(res.status).toBe(200);
    const [pass] = ran[0]?.passes ?? [];
    expect(await pass?.purgeBatch(new Date(), 25)).toBe(2);
    expect(expireImpersonations.execute).toHaveBeenCalledWith({ batchSize: 25 });
    expect(await pass?.countEligible(new Date())).toBe(5);
  });

  it("fails the batch when the expiry fails, so the runner records it", async () => {
    expireApprovals.execute.mockResolvedValue(
      Result.fail({ code: "ADMIN_APPROVAL_PROVIDER_FAILURE", message: "down" }),
    );

    await sweep("sweep-admin-approvals");

    const [pass] = ran[0]?.passes ?? [];
    await expect(pass?.purgeBatch(new Date(), 10)).rejects.toThrow();
  });
});

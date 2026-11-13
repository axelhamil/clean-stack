import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type { ApprovalRecord } from "../../../application/ports/repositories/approval-store.port";
import { ACTOR_ID, adminApp, errorCodeOf, MANAGER, send } from "../../fixtures/http-app";
import type { AdminRoutesDeps } from "../../fixtures/mount-admin-routes";

const CREATED = new Date("2026-01-02T03:04:05.000Z");

const RECORD: ApprovalRecord = {
  id: "approval-1",
  action: "staff.revoke",
  subjectId: "u-2",
  params: {},
  requestedBy: "u-3",
  status: "pending",
  decidedBy: Option.none(),
  decisionNote: Option.none(),
  failureReason: Option.none(),
  expiresAt: CREATED,
  decidedAt: Option.none(),
  createdAt: CREATED,
  version: 1,
};

const SERIALIZED = {
  id: "approval-1",
  action: "staff.revoke",
  subjectId: "u-2",
  params: {},
  requestedBy: "u-3",
  status: "pending",
  decidedBy: null,
  decisionNote: null,
  failureReason: null,
  expiresAt: CREATED.toISOString(),
  decidedAt: null,
  createdAt: CREATED.toISOString(),
  version: 1,
};

let approvals = mockPort<AdminRoutesDeps["ApprovalService"]>();

beforeEach(() => {
  approvals = mockPort<AdminRoutesDeps["ApprovalService"]>();
});

const app = () => adminApp({ ApprovalService: approvals });

describe("GET /admin/approvals", () => {
  it("lists approvals with the next cursor", async () => {
    approvals.list.mockResolvedValue(
      Result.ok({ items: [RECORD], nextCursor: Option.some("cursor-2") }),
    );

    const res = await send(app(), "GET", "/admin/approvals?status=pending");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [SERIALIZED], nextCursor: "cursor-2" });
    expect(approvals.list).toHaveBeenCalledWith({ status: "pending", limit: 50 });
  });

  it("refuses an unknown status", async () => {
    const res = await send(app(), "GET", "/admin/approvals?status=lost");

    expect(res.status).toBe(400);
    expect(approvals.list).not.toHaveBeenCalled();
  });
});

describe("GET /admin/approvals/:id", () => {
  it("returns one approval", async () => {
    approvals.get.mockResolvedValue(Result.ok(RECORD));

    const res = await send(app(), "GET", "/admin/approvals/approval-1");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SERIALIZED);
    expect(approvals.get).toHaveBeenCalledWith("approval-1");
  });

  it("answers 404 for an unknown approval", async () => {
    approvals.get.mockResolvedValue(
      Result.fail({ code: "ADMIN_APPROVAL_NOT_FOUND", message: "none" }),
    );

    const res = await send(app(), "GET", "/admin/approvals/ghost");

    expect(res.status).toBe(404);
    expect(await errorCodeOf(res)).toBe("ADMIN_APPROVAL_NOT_FOUND");
  });
});

describe("POST /admin/approvals/:id/decide", () => {
  it("decides as the current staff member with their permissions", async () => {
    approvals.decide.mockResolvedValue(Result.ok());

    const res = await send(app(), "POST", "/admin/approvals/approval-1/decide", {
      decision: "approve",
      note: " fine ",
    });

    expect(res.status).toBe(200);
    expect(approvals.decide).toHaveBeenCalledWith({
      approvalId: "approval-1",
      deciderUserId: ACTOR_ID,
      deciderPermissions: MANAGER.permissions,
      decision: "approve",
      note: "fine",
    });
  });

  it("refuses a decision without a note", async () => {
    const res = await send(app(), "POST", "/admin/approvals/approval-1/decide", {
      decision: "reject",
      note: "",
    });

    expect(res.status).toBe(400);
    expect(approvals.decide).not.toHaveBeenCalled();
  });

  it("surfaces a refused decision", async () => {
    approvals.decide.mockResolvedValue(
      Result.fail({ code: "ADMIN_APPROVAL_SELF_DECISION_FORBIDDEN", message: "own" }),
    );

    const res = await send(app(), "POST", "/admin/approvals/approval-1/decide", {
      decision: "approve",
      note: "fine",
    });

    expect(res.status).toBe(403);
    expect(await errorCodeOf(res)).toBe("ADMIN_APPROVAL_SELF_DECISION_FORBIDDEN");
  });
});

describe("POST /admin/approvals/:id/cancel", () => {
  it("cancels on behalf of the current user", async () => {
    approvals.cancel.mockResolvedValue(Result.ok());

    const res = await send(app(), "POST", "/admin/approvals/approval-1/cancel");

    expect(res.status).toBe(200);
    expect(approvals.cancel).toHaveBeenCalledWith({ approvalId: "approval-1", userId: ACTOR_ID });
  });
});

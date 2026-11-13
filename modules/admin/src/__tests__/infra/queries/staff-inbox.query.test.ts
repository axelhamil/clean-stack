import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import type { ISweepRunStore, SweepOutcome } from "@packages/http/sweep-run.port";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { IApprovalStore } from "../../../application/ports/repositories/approval-store.port";
import type { IOpsStore } from "../../../application/ports/repositories/ops-store.port";
import { StaffInboxQuery } from "../../../infra/queries/staff-inbox.query";

const DAY_MS = 24 * 60 * 60 * 1000;

function sweep(label: string, outcome: SweepOutcome, finishedAt = new Date()) {
  return { label, outcome, startedAt: finishedAt, finishedAt, durationMs: 1, count: 0 };
}

function setup() {
  const approvals = mockPort<IApprovalStore>();
  approvals.listOpen.mockImplementation(async () => Result.ok({ items: [], total: 4 }));

  const ops = mockPort<IOpsStore>();
  ops.countDeadOutbox.mockImplementation(async () => Result.ok(2));
  ops.countDeadQueues.mockImplementation(async () => Result.ok({ emails: 3, webhooks: 1 }));

  const sweeps = mockPort<ISweepRunStore>();
  sweeps.list.mockImplementation(async () =>
    Result.ok([
      sweep("a", "ok"),
      sweep("b", "truncated"),
      sweep("c", "failed"),
      sweep("d", "batch-error"),
      sweep("e", "ok", new Date(Date.now() - 2 * DAY_MS)),
    ]),
  );

  return {
    approvals,
    ops,
    sweeps,
    query: new StaffInboxQuery(approvals, ops, sweeps, mockInstrumentation()),
  };
}

describe("StaffInboxQuery", () => {
  it("reads nothing a staff member's permissions do not open", async () => {
    const { query, approvals, ops, sweeps } = setup();

    const inbox = (await query.execute({ permissions: ["users.read"] })).getValue();

    expect(inbox.approvals.isNone()).toBe(true);
    expect(inbox.queues.isNone()).toBe(true);
    expect(inbox.sweeps.isNone()).toBe(true);
    expect(approvals.listOpen).not.toHaveBeenCalled();
    expect(ops.countDeadOutbox).not.toHaveBeenCalled();
    expect(sweeps.list).not.toHaveBeenCalled();
  });

  it("opens approvals without operations on approvals.decide alone", async () => {
    const { query } = setup();

    const inbox = (await query.execute({ permissions: ["approvals.decide"] })).getValue();

    expect(inbox.approvals.unwrap().getValue().total).toBe(4);
    expect(inbox.queues.isNone()).toBe(true);
  });

  it("lists failed and late jobs, a truncated run is a healthy backlog", async () => {
    const { query } = setup();

    const inbox = (await query.execute({ permissions: ["ops.read"] })).getValue();

    expect(
      inbox.sweeps
        .unwrap()
        .getValue()
        .map((run) => [run.label, run.late]),
    ).toEqual([
      ["c", false],
      ["d", false],
      ["e", true],
    ]);
    expect(inbox.queues.unwrap().getValue()).toEqual({
      deadEvents: 2,
      deadEmails: 3,
      deadWebhooks: 1,
    });
  });

  it("keeps the other sources visible when one fails", async () => {
    const { query, ops, sweeps } = setup();
    ops.countDeadQueues.mockImplementation(async () =>
      Result.fail({ code: "ADMIN_OPS_PROVIDER_FAILURE", message: "db down" }),
    );

    const inbox = (
      await query.execute({ permissions: ["approvals.decide", "ops.read"] })
    ).getValue();

    expect(inbox.queues.unwrap().isFailure).toBe(true);
    expect(inbox.approvals.unwrap().getValue().total).toBe(4);
    expect(inbox.sweeps.unwrap().isSuccess).toBe(true);
    expect(sweeps.list).toHaveBeenCalledTimes(1);
  });
});

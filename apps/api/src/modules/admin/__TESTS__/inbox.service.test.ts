import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type { ISweepRunStore, SweepOutcome } from "../../../shared/ports/sweep-run.port";
import type { IApprovalStore } from "../application/ports/approval-store.port";
import type { IOpsStore } from "../application/ports/ops-store.port";
import { InboxService } from "../application/services/inbox.service";

function sweep(label: string, outcome: SweepOutcome) {
  const at = new Date();

  return { label, outcome, startedAt: at, finishedAt: at, durationMs: 1, count: 0 };
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
    ]),
  );

  return { approvals, ops, sweeps, service: new InboxService(approvals, ops, sweeps) };
}

describe("InboxService", () => {
  it("reads nothing a staff member's permissions do not open", async () => {
    const { service, approvals, ops, sweeps } = setup();

    const inbox = (await service.forStaff(["users.read"])).getValue();

    expect(inbox.approvals.isNone()).toBe(true);
    expect(inbox.operations.isNone()).toBe(true);
    expect(approvals.listOpen).not.toHaveBeenCalled();
    expect(ops.countDeadOutbox).not.toHaveBeenCalled();
    expect(sweeps.list).not.toHaveBeenCalled();
  });

  it("opens approvals without operations on approvals.decide alone", async () => {
    const { service } = setup();

    const inbox = (await service.forStaff(["approvals.decide"])).getValue();

    expect(inbox.approvals.unwrap().total).toBe(4);
    expect(inbox.operations.isNone()).toBe(true);
  });

  it("lists only the sweeps that failed, a truncated run is a healthy backlog", async () => {
    const { service } = setup();

    const inbox = (await service.forStaff(["ops.read"])).getValue();
    const operations = inbox.operations.unwrap();

    expect(operations.failedSweeps.map((run) => run.label)).toEqual(["c", "d"]);
    expect(operations.deadEvents).toBe(2);
    expect(operations.deadEmails).toBe(3);
    expect(operations.deadWebhooks).toBe(1);
  });
});

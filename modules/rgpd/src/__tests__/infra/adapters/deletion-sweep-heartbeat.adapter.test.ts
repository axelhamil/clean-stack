import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import type { ISweepRunStore } from "@packages/http/sweep-run.port";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { DeletionSweepRun } from "../../../application/ports/services/deletion-sweep-heartbeat.port";
import { DeletionSweepHeartbeat } from "../../../infra/adapters/deletion-sweep-heartbeat.adapter";

function sweepRun(over: Partial<DeletionSweepRun> = {}): DeletionSweepRun {
  return { succeeded: ["u1", "u2"], failed: [], dryRun: false, truncated: false, ...over };
}

function given() {
  const store = mockPort<ISweepRunStore>();
  store.record.mockResolvedValue(Result.ok());

  return { store, heartbeat: new DeletionSweepHeartbeat(store, mockInstrumentation()) };
}

describe("record the heartbeat of a deletion sweep", () => {
  it("records a batch error counting the succeeded accounts when some wipes failed", async () => {
    const { store, heartbeat } = given();
    const run = sweepRun({ failed: [{ userId: "u3", errorCode: "X" }] });

    await heartbeat.around(false, async () => Result.ok(run));

    expect(store.record.mock.calls[0]?.[0]).toMatchObject({
      label: "rgpd-sweep",
      outcome: "batch-error",
      count: 2,
    });
  });

  it("records a truncated run when the time budget cut the batch", async () => {
    const { store, heartbeat } = given();

    await heartbeat.around(false, async () => Result.ok(sweepRun({ truncated: true })));

    expect(store.record.mock.calls[0]?.[0]).toMatchObject({ outcome: "truncated", count: 2 });
  });

  it("records a failed run and hands the failure back when the sweep fails", async () => {
    const { store, heartbeat } = given();
    const refused = { code: "RGPD_REPOSITORY_PROVIDER_FAILURE", message: "batch unreadable" };

    const result = await heartbeat.around(false, async () =>
      Result.fail<DeletionSweepRun, typeof refused>(refused),
    );

    expect(result.isFailure && result.getError()).toEqual(refused);
    expect(store.record.mock.calls[0]?.[0]).toMatchObject({ outcome: "failed", count: 0 });
  });

  it("records nothing for a dry run", async () => {
    const { store, heartbeat } = given();

    await heartbeat.around(true, async () => Result.ok(sweepRun({ dryRun: true })));

    expect(store.record).not.toHaveBeenCalled();
  });
});

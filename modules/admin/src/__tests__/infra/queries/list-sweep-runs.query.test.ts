import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import type { ISweepRunStore } from "@packages/http/sweep-run.port";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { SweepRunsQuery } from "../../../infra/queries/list-sweep-runs.query";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("SweepRunsQuery", () => {
  it("derives a late job from its last finish, whatever that run reported", async () => {
    const sweeps = mockPort<ISweepRunStore>();
    const at = new Date(Date.now() - 2 * DAY_MS);
    sweeps.list.mockImplementation(async () =>
      Result.ok([
        { label: "sweep-x", outcome: "ok", startedAt: at, finishedAt: at, durationMs: 1, count: 0 },
      ]),
    );

    const runs = (await new SweepRunsQuery(sweeps, mockInstrumentation()).execute()).getValue();

    expect(runs[0]?.late).toBe(true);
  });
});

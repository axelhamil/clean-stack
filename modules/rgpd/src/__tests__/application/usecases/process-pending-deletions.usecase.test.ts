import { describe, expect, it } from "bun:test";
import { type ILogger, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type {
  IDeletionStateRepository,
  PendingDeletionRow,
} from "../../../application/ports/repositories/deletion-state.port";
import type { IDeletionSweepHeartbeat } from "../../../application/ports/services/deletion-sweep-heartbeat.port";
import type { AccountWipeService } from "../../../application/services/account-wipe.service";
import { ProcessPendingDeletionsUseCase } from "../../../application/usecases/process-pending-deletions/process-pending-deletions.usecase";
import { NOW, REPO_DOWN } from "../fixtures";

const WIPED = { deletedOrgIds: [], storageKeysDeleted: 0 };

function pendingRow(userId: string): PendingDeletionRow {
  return { userId, email: `${userId}@example.com`, pendingDeletionUntil: NOW };
}

function given(userIds: string[] = ["u1", "u2", "u3"]) {
  const states = mockPort<IDeletionStateRepository>();
  const wipes = mockPort<Pick<AccountWipeService, "wipe">>();

  states.findReadyForWipe.mockResolvedValue(Result.ok(userIds.map(pendingRow)));
  wipes.wipe.mockResolvedValue(Result.ok(WIPED));
  const heartbeat = mockPort<IDeletionSweepHeartbeat>();
  heartbeat.around.mockImplementation((_dryRun, run) => run());

  const useCase = new ProcessPendingDeletionsUseCase(
    states,
    wipes,
    heartbeat,
    { sweepDeadlineMs: 90_000 },
    mockPort<ILogger>(),
  );

  return { states, wipes, heartbeat, useCase };
}

function clockStepping(stepMs: number) {
  let reads = 0;
  return () => {
    reads += 1;
    return reads * stepMs;
  };
}

describe("process the accounts whose deletion grace has elapsed", () => {
  it("runs the whole sweep inside the heartbeat, which learns whether it is a dry run", async () => {
    const { heartbeat, wipes, useCase } = given(["u1"]);
    heartbeat.around.mockImplementation(async (_dryRun, run) => {
      expect(wipes.wipe).not.toHaveBeenCalled();
      const result = await run();
      expect(wipes.wipe).toHaveBeenCalledTimes(1);

      return result;
    });

    const result = await useCase.execute({ dryRun: false });

    expect(result.isSuccess).toBe(true);
    expect(heartbeat.around.mock.calls[0]?.[0]).toBe(false);
  });

  it("loads a batch of 50 accounts when no size is given", async () => {
    const world = given();

    await world.useCase.execute({});

    expect(world.states.findReadyForWipe).toHaveBeenCalledWith(50);
  });

  it("loads at most the requested batch size", async () => {
    const world = given(["u1", "u2"]);

    const result = await world.useCase.execute({ batchSize: 2 });

    expect(world.states.findReadyForWipe).toHaveBeenCalledWith(2);
    expect(result.getValue().processed).toBe(2);
  });

  it("fails the sweep when the batch cannot be loaded", async () => {
    const world = given();
    world.states.findReadyForWipe.mockResolvedValue(Result.fail(REPO_DOWN));

    const result = await world.useCase.execute({});

    expect(result.getError()).toEqual(REPO_DOWN);
  });

  it("lists the accounts it would wipe without wiping any in a dry run", async () => {
    const world = given();

    const result = await world.useCase.execute({ dryRun: true });

    expect(result.getValue()).toEqual({
      processed: 3,
      succeeded: ["u1", "u2", "u3"],
      failed: [],
      dryRun: true,
      truncated: false,
    });
    expect(world.wipes.wipe).not.toHaveBeenCalled();
  });

  it("wipes every account of the batch through the account wipe service", async () => {
    const world = given();

    const result = await world.useCase.execute({});

    expect(result.getValue()).toEqual({
      processed: 3,
      succeeded: ["u1", "u2", "u3"],
      failed: [],
      dryRun: false,
      truncated: false,
    });
    expect(world.wipes.wipe.mock.calls).toEqual([["u1"], ["u2"], ["u3"]]);
  });

  it("lists a failed wipe with its code and keeps wiping the others", async () => {
    const world = given();
    world.wipes.wipe.mockImplementation(async (userId) =>
      userId === "u2"
        ? Result.fail({ code: "ACCOUNT_WIPE_PROVIDER_FAILURE", message: "down" })
        : Result.ok(WIPED),
    );

    const result = await world.useCase.execute({});

    expect(result.getValue().succeeded).toEqual(["u1", "u3"]);
    expect(result.getValue().failed).toEqual([
      { userId: "u2", errorCode: "ACCOUNT_WIPE_PROVIDER_FAILURE" },
    ]);
    expect(result.getValue().processed).toBe(3);
  });

  it("lists a wipe that throws as uncaught and keeps wiping the others", async () => {
    const world = given();
    world.wipes.wipe.mockImplementation(async (userId) => {
      if (userId === "u1") throw new Error("contract violated");
      return Result.ok(WIPED);
    });

    const result = await world.useCase.execute({});

    expect(result.getValue().succeeded).toEqual(["u2", "u3"]);
    expect(result.getValue().failed).toEqual([{ userId: "u1", errorCode: "WIPE_UNCAUGHT" }]);
  });

  it("stops between wipes once the time budget is spent and reports truncated", async () => {
    const world = given();

    const result = await world.useCase.execute({ deadlineMs: 100, now: clockStepping(60) });

    expect(result.getValue()).toEqual({
      processed: 1,
      succeeded: ["u1"],
      failed: [],
      dryRun: false,
      truncated: true,
    });
    expect(world.wipes.wipe).toHaveBeenCalledTimes(1);
  });

  it("is not truncated when every account finishes inside the budget", async () => {
    const world = given();

    const result = await world.useCase.execute({ deadlineMs: 100, now: () => 0 });

    expect(result.getValue().succeeded).toHaveLength(3);
    expect(result.getValue().truncated).toBe(false);
  });
});

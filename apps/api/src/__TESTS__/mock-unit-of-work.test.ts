import { describe, expect, it } from "bun:test";
import { EventCollector, type IDomainEvent, Result } from "@packages/ddd-kit";
import { COMMIT_FAILURE, mockUnitOfWork } from "@packages/test/bun/unit-of-work";

const eventOf = (aggregateId: string): IDomainEvent => ({
  eventType: "user.profile.updated",
  dateOccurred: new Date("2026-10-29T10:00:00Z"),
  aggregateId,
  payload: {},
});

describe("mockUnitOfWork", () => {
  it("given a work that succeeds, when run, then it commits and exposes written events", async () => {
    const { unitOfWork, outcome, writtenEvents } = mockUnitOfWork();

    const result = await unitOfWork.run(async () => {
      EventCollector.add(eventOf("user-1"));

      return Result.ok("done");
    });

    expect(result.getValue()).toBe("done");
    expect(outcome()).toBe("committed");
    expect(writtenEvents().map((event) => event.aggregateId)).toEqual(["user-1"]);
  });

  it("given a work that returns a failed Result, when run, then it rolls back and writes no event", async () => {
    const { unitOfWork, outcome, writtenEvents } = mockUnitOfWork();
    const failure = Result.fail("USER_NOT_FOUND");

    const result = await unitOfWork.run(async () => {
      EventCollector.add(eventOf("user-1"));

      return failure;
    });

    expect(result).toBe(failure);
    expect(outcome()).toBe("rolled_back");
    expect(writtenEvents()).toEqual([]);
  });

  it("given a nested run that fails, when the outer work swallows it, then the outer returns the nested failure", async () => {
    const { unitOfWork, outcome, writtenEvents } = mockUnitOfWork();
    const nestedFailure = Result.fail<void>("QUOTA_EXCEEDED");

    const result = await unitOfWork.run(async () => {
      EventCollector.add(eventOf("outer"));
      await unitOfWork
        .run(async () => {
          EventCollector.add(eventOf("nested"));

          return nestedFailure;
        })
        .catch(() => undefined);

      return Result.ok();
    });

    expect(result).toBe(nestedFailure);
    expect(outcome()).toBe("rolled_back");
    expect(writtenEvents()).toEqual([]);
  });

  it("given a nested run that throws, when the outer work catches it, then the outer run rejects with that error", async () => {
    const { unitOfWork, outcome, writtenEvents } = mockUnitOfWork();
    const nestedError = new Error("nested crash");

    const run = unitOfWork.run(async () => {
      EventCollector.add(eventOf("outer"));
      await unitOfWork
        .run(async () => {
          throw nestedError;
        })
        .catch(() => undefined);

      return Result.ok();
    });

    await expect(run).rejects.toBe(nestedError);
    expect(outcome()).toBe("rolled_back");
    expect(writtenEvents()).toEqual([]);
  });

  it("given a commit that fails, when run, then it rejects and writes nothing", async () => {
    const { unitOfWork, outcome, writtenEvents } = mockUnitOfWork({ commit: "fails" });

    const run = unitOfWork.run(async () => {
      EventCollector.add(eventOf("user-1"));

      return Result.ok();
    });

    await expect(run).rejects.toThrow(COMMIT_FAILURE);
    expect(outcome()).toBe("rolled_back");
    expect(writtenEvents()).toEqual([]);
  });
});

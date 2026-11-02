import { describe, expect, it } from "bun:test";
import { Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { db } from "@packages/drizzle";
import { mockPort } from "@packages/test/bun";
import { asUnitOfWork, type OutermostUnitOfWork } from "../unit-of-work-adapter";

const openedTransaction = { name: "better-auth-tx" };

function unitOfWorkResolvingTo(outcome: (workValue: unknown) => unknown) {
  const uow = mockPort<OutermostUnitOfWork>();
  uow.runOutermost.mockImplementation(async (work) =>
    outcome(await UnitOfWorkContext.run(openedTransaction, work)),
  );

  return uow;
}

describe("asUnitOfWork", () => {
  it("given BetterAuth opens a transaction, when the unit of work commits, then the work runs on the transaction that run opened and its value is returned", async () => {
    const uow = unitOfWorkResolvingTo((value) => value);
    const client = asUnitOfWork(db, () => uow);

    const value = await client.transaction(async (tx) => ({ handed: tx }));

    expect<unknown>(value.handed).toBe(openedTransaction);
  });

  it("given a hook doomed the unit of work, when the run resolves to a failed Result, then BetterAuth's transaction rejects instead of reporting success", async () => {
    const failure = Result.fail("SEAT_LIMIT_REACHED");
    const uow = unitOfWorkResolvingTo(() => failure);
    const client = asUnitOfWork(db, () => uow);

    const transaction = client.transaction(async () => "created");

    await expect(transaction).rejects.toThrow("SEAT_LIMIT_REACHED");
  });
});

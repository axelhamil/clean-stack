import { describe, expect, it } from "bun:test";
import { Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IUserNameWriter } from "../../../application/ports/services/user-name-writer.port";
import { UpdateDisplayNameUseCase } from "../../../application/usecases/update-display-name/update-display-name.usecase";

const USER = "user-1";

function given() {
  const names = mockPort<IUserNameWriter>();
  const outbox = mockPort<IOutboxRepository>();
  const { unitOfWork, outcome } = mockUnitOfWork();
  const transactions: { write: unknown[]; enqueue: unknown[] } = { write: [], enqueue: [] };
  names.setName.mockImplementation(async () => {
    transactions.write.push(UnitOfWorkContext.transaction());
    return Result.ok();
  });
  outbox.enqueue.mockImplementation(async () => {
    transactions.enqueue.push(UnitOfWorkContext.transaction());
  });
  const useCase = new UpdateDisplayNameUseCase(names, unitOfWork, outbox);

  return { names, outbox, outcome, transactions, useCase };
}

describe("update the display name of a user", () => {
  it("writes the name and announces the profile change in the same unit of work", async () => {
    const { names, outbox, outcome, transactions, useCase } = given();

    const result = await useCase.execute({ userId: USER, name: "Ada" });

    expect(result.isSuccess).toBe(true);
    expect(outcome()).toBe("committed");
    expect(names.setName).toHaveBeenCalledWith(USER, "Ada");
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.USER_PROFILE_UPDATED,
        aggregateId: USER,
        payload: { userId: USER, changes: { name: "Ada" } },
      },
    ]);
    const [writeTx] = transactions.write;
    expect(writeTx).toBeDefined();
    expect(transactions.enqueue).toEqual([writeTx]);
  });

  it("fails, announces nothing and rolls back when the write fails", async () => {
    const { names, outbox, outcome, useCase } = given();
    names.setName.mockResolvedValue(
      Result.fail({ code: "USER_ACCOUNT_PROVIDER_FAILURE", message: "db down" }),
    );

    const result = await useCase.execute({ userId: USER, name: "Ada" });

    expect(result.getError().code).toBe("USER_ACCOUNT_PROVIDER_FAILURE");
    expect(outcome()).toBe("rolled_back");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

import { describe, expect, it } from "bun:test";
import { Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IProfileRepository } from "../../../application/ports/repositories/profile.port";
import type { IGetLocaleQuery } from "../../../application/queries/get-locale.query";
import { SetLocaleUseCase } from "../../../application/usecases/set-locale/set-locale.usecase";

const USER = "user-1";

function given() {
  const currentLocale = mockPort<IGetLocaleQuery>();
  const repo = mockPort<IProfileRepository>();
  const outbox = mockPort<IOutboxRepository>();
  const { unitOfWork, outcome } = mockUnitOfWork();
  const transactions: { write: unknown[]; enqueue: unknown[] } = { write: [], enqueue: [] };
  currentLocale.execute.mockResolvedValue(Result.ok(Option.none()));
  repo.setLocale.mockImplementation(async () => {
    transactions.write.push(UnitOfWorkContext.transaction());
    return Result.ok();
  });
  outbox.enqueue.mockImplementation(async () => {
    transactions.enqueue.push(UnitOfWorkContext.transaction());
  });
  const useCase = new SetLocaleUseCase(currentLocale, repo, unitOfWork, outbox);

  return { currentLocale, repo, outbox, outcome, transactions, useCase };
}

function localeChanged(previousLocale: string | null) {
  return {
    eventType: EventTypes.USER_LOCALE_CHANGED,
    aggregateId: USER,
    payload: { userId: USER, locale: "fr", previousLocale },
  };
}

describe("set the locale of a user", () => {
  it("writes the locale and announces it with no previous locale when none was chosen", async () => {
    const { repo, outbox, outcome, useCase } = given();

    const result = await useCase.execute({ userId: USER, locale: "fr" });

    expect(result.isSuccess).toBe(true);
    expect(outcome()).toBe("committed");
    expect(repo.setLocale).toHaveBeenCalledWith(USER, "fr");
    expect(enqueuedEvents(outbox)).toEqual([localeChanged(null)]);
  });

  it("carries the previous locale when one was chosen", async () => {
    const { currentLocale, outbox, useCase } = given();
    currentLocale.execute.mockResolvedValue(Result.ok(Option.some("en")));

    await useCase.execute({ userId: USER, locale: "fr" });

    expect(enqueuedEvents(outbox)).toEqual([localeChanged("en")]);
  });

  it("writes and announces inside the same unit of work", async () => {
    const { transactions, useCase } = given();

    await useCase.execute({ userId: USER, locale: "fr" });

    const [writeTx] = transactions.write;
    expect(writeTx).toBeDefined();
    expect(transactions.enqueue).toEqual([writeTx]);
  });

  it("fails, announces nothing and rolls back when the write fails", async () => {
    const { repo, outbox, outcome, useCase } = given();
    repo.setLocale.mockResolvedValue(
      Result.fail({ code: "PROFILE_PROVIDER_FAILURE", message: "db down" }),
    );

    const result = await useCase.execute({ userId: USER, locale: "fr" });

    expect(result.getError().code).toBe("PROFILE_PROVIDER_FAILURE");
    expect(outcome()).toBe("rolled_back");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("fails without writing when the current locale cannot be read", async () => {
    const { currentLocale, repo, outbox, outcome, useCase } = given();
    currentLocale.execute.mockResolvedValue(
      Result.fail({ code: "PROFILE_PROVIDER_FAILURE", message: "db down" }),
    );

    const result = await useCase.execute({ userId: USER, locale: "fr" });

    expect(result.getError().code).toBe("PROFILE_PROVIDER_FAILURE");
    expect(outcome()).toBe("rolled_back");
    expect(repo.setLocale).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

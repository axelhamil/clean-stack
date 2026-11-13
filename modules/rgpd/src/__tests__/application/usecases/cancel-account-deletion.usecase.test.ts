import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { type ILogger, Option, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { EventTypes } from "@packages/events";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type {
  IDeletionStateRepository,
  UserDeletionState,
} from "../../../application/ports/repositories/deletion-state.port";
import { CancelAccountDeletionUseCase } from "../../../application/usecases/cancel-account-deletion/cancel-account-deletion.usecase";
import {
  DAY_MS,
  EMAIL_DOWN,
  inTransaction,
  NOW,
  REPO_DOWN,
  recordingOutbox,
  sameUnit,
  USER_ID,
  userState,
} from "../fixtures";

const PENDING_UNTIL = new Date(NOW.getTime() + DAY_MS);

function given(state: UserDeletionState = userState({ pendingUntil: PENDING_UNTIL })) {
  const seen: unknown[] = [];
  const states = mockPort<IDeletionStateRepository>();
  const email = mockPort<IEmailService>();
  const outbox = recordingOutbox(seen);
  const uow = mockUnitOfWork();
  const logger = mockPort<ILogger>();

  states.findByUser.mockResolvedValue(Result.ok(Option.some(state)));
  states.clearPending.mockImplementation(inTransaction(seen, Result.ok()));
  email.sendTemplate.mockResolvedValue(Result.ok());

  const useCase = new CancelAccountDeletionUseCase(states, email, uow.unitOfWork, outbox, logger);

  return { seen, states, email, outbox, uow, logger, useCase };
}

describe("cancel a pending account deletion", () => {
  beforeEach(() => setSystemTime(NOW));

  afterEach(() => setSystemTime());

  it("refuses an unknown user as not found", async () => {
    const world = given();
    world.states.findByUser.mockResolvedValue(Result.ok(Option.none()));

    const result = await world.useCase.execute({ userId: USER_ID });

    expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
  });

  it("refuses an account already wiped, there is nothing left to cancel", async () => {
    const world = given(userState({ wipedAt: new Date(NOW.getTime() - DAY_MS) }));

    const result = await world.useCase.execute({ userId: USER_ID });

    expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
    expect(world.states.clearPending).not.toHaveBeenCalled();
  });

  it("refuses when no deletion is pending", async () => {
    const world = given(userState());

    const result = await world.useCase.execute({ userId: USER_ID });

    expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
    expect(world.states.clearPending).not.toHaveBeenCalled();
  });

  it("clears the pending deletion and announces it in one unit", async () => {
    const world = given();

    const result = await world.useCase.execute({ userId: USER_ID });

    expect(result.getValue()).toEqual({ ok: true });
    expect(world.states.clearPending).toHaveBeenCalledWith(USER_ID);
    expect(enqueuedEvents(world.outbox)).toEqual([
      {
        eventType: EventTypes.USER_DELETION_CANCELLED,
        aggregateId: USER_ID,
        payload: { userId: USER_ID },
      },
    ]);
    expect(world.seen).toHaveLength(2);
    expect(sameUnit(world.seen)).toBe(true);
  });

  it("announces nothing and emails nobody when the pending deletion cannot be cleared", async () => {
    const world = given();
    world.states.clearPending.mockResolvedValue(Result.fail(REPO_DOWN));

    const result = await world.useCase.execute({ userId: USER_ID });

    expect(result.getError()).toEqual(REPO_DOWN);
    expect(enqueuedEvents(world.outbox)).toEqual([]);
    expect(world.email.sendTemplate).not.toHaveBeenCalled();
  });

  it("emails the cancellation with an idempotency key bound to the cancelled deadline", async () => {
    const world = given();

    await world.useCase.execute({ userId: USER_ID });

    expect(world.email.sendTemplate).toHaveBeenCalledWith(
      "delete_cancelled",
      "u@example.com",
      { name: "User" },
      { idempotencyKey: `delete-cancelled/${USER_ID}/${PENDING_UNTIL.getTime()}`, locale: "fr" },
    );
  });

  it("keeps the cancellation when the email fails, only logging it", async () => {
    const world = given();
    world.email.sendTemplate.mockResolvedValue(Result.fail(EMAIL_DOWN));

    const result = await world.useCase.execute({ userId: USER_ID });

    expect(result.isSuccess).toBe(true);
    expect(world.uow.outcome()).toBe("committed");
    expect(world.logger.warn).toHaveBeenCalled();
  });
});

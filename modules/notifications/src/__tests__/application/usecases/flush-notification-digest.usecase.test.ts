import { describe, expect, it } from "bun:test";
import { type ILogger, Option, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type {
  DueNotification,
  INotificationDigestStore,
} from "../../../application/ports/repositories/notification-digest.port";
import { FlushNotificationDigestUseCase } from "../../../application/usecases/flush-notification-digest/flush-notification-digest.usecase";

const due = (id: string, userId = "u1", emailStillWanted = true): DueNotification => ({
  id,
  userId,
  category: "billing",
  eventType: "billing.payment.failed",
  email: `${userId}@example.com`,
  locale: Option.some("fr"),
  payload: {},
  emailStillWanted,
});

function given(lockGranted = true) {
  const store = mockPort<INotificationDigestStore>();
  const email = mockPort<IEmailService>();
  const uow = mockUnitOfWork();
  store.beginFlush.mockResolvedValue(Result.ok(lockGranted));
  store.claimDue.mockResolvedValue(Result.ok([]));
  store.markSent.mockResolvedValue(Result.ok());
  store.dropUnwanted.mockResolvedValue(Result.ok());
  email.sendTemplateBatch.mockResolvedValue(Result.ok());
  const useCase = new FlushNotificationDigestUseCase(
    store,
    email,
    uow.unitOfWork,
    mockInstrumentation(),
    mockPort<ILogger>(),
  );

  return { store, email, uow, useCase };
}

const sentRecipients = (email: ReturnType<typeof given>["email"]) =>
  email.sendTemplateBatch.mock.calls.flatMap(([, recipients]) => recipients);

describe("flush the notification digest", () => {
  it("counts what is due on a dry run and touches nothing", async () => {
    const { store, email, useCase } = given();
    store.countDue.mockResolvedValue(Result.ok(7));

    const result = await useCase.execute({ batchSize: 500, dryRun: true });

    expect(result.getValue()).toEqual({ dryRun: true, eligible: 7, flushed: 0, notifications: 0 });
    expect(store.beginFlush).not.toHaveBeenCalled();
    expect(email.sendTemplateBatch).not.toHaveBeenCalled();
  });

  it("skips and sends nothing while another run holds the lock", async () => {
    const { store, email, useCase } = given(false);

    const result = await useCase.execute({ batchSize: 500, dryRun: false });

    expect(result.getValue()).toEqual({
      dryRun: false,
      skipped: true,
      flushed: 0,
      notifications: 0,
    });
    expect(store.claimDue).not.toHaveBeenCalled();
    expect(email.sendTemplateBatch).not.toHaveBeenCalled();
  });

  it("sends one digest per user and category for every page due now, in the recipient's language", async () => {
    const { store, email, uow, useCase } = given();
    store.claimDue
      .mockResolvedValueOnce(Result.ok([due("n1"), due("n2")]))
      .mockResolvedValueOnce(Result.ok([due("n3"), due("n4", "u2")]))
      .mockResolvedValueOnce(Result.ok([]));

    const result = await useCase.execute({ batchSize: 2, dryRun: false });

    expect(result.getValue()).toEqual({
      dryRun: false,
      skipped: false,
      flushed: 2,
      notifications: 4,
    });
    const recipients = sentRecipients(email);
    expect(recipients.map((r) => [r.to, r.variables.itemCount, r.locale])).toEqual([
      ["u1@example.com", "3", "fr"],
      ["u2@example.com", "1", "fr"],
    ]);
    expect(recipients[0]?.idempotencyKey).toHaveLength(64);
    expect(store.markSent.mock.calls.map(([ids]) => ids)).toEqual([
      ["n1", "n2"],
      ["n3", "n4"],
    ]);
    expect(uow.outcome()).toBe("committed");
  });

  it("drops a row whose e-mail preference changed since it was queued and does not mail it", async () => {
    const { store, email, useCase } = given();
    store.claimDue.mockResolvedValueOnce(Result.ok([due("n1"), due("n2", "u1", false)]));

    const result = await useCase.execute({ batchSize: 500, dryRun: false });

    expect(result.getValue()).toMatchObject({ flushed: 1, notifications: 1 });
    expect(store.dropUnwanted).toHaveBeenCalledWith(["n2"]);
    expect(store.markSent).toHaveBeenCalledWith(["n1"], expect.any(Date));
    expect(sentRecipients(email).map((r) => r.variables.itemCount)).toEqual(["1"]);
  });

  it("fails with the queue error and rolls the marks back when the digest cannot be enqueued", async () => {
    const { store, email, uow, useCase } = given();
    store.claimDue.mockResolvedValueOnce(Result.ok([due("n1")]));
    email.sendTemplateBatch.mockResolvedValue(
      Result.fail({ code: "EMAIL_PROVIDER_FAILURE", message: "queue down" }),
    );

    const result = await useCase.execute({ batchSize: 500, dryRun: false });

    expect(result.getError()).toEqual({ code: "EMAIL_PROVIDER_FAILURE", message: "queue down" });
    expect(uow.outcome()).toBe("rolled_back");
  });
});

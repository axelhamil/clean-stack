import { describe, expect, it } from "bun:test";
import { Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IConsentRepository } from "../../../application/ports/repositories/consent.port";
import { ReconcileConsentUseCase } from "../../../application/usecases/reconcile-consent/reconcile-consent.usecase";

function given(linkedIds: string[]) {
  const repository = mockPort<IConsentRepository>();
  const outbox = mockPort<IOutboxRepository>();
  const seen: unknown[] = [];
  repository.linkSubjectToUser.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
    return Result.ok(linkedIds);
  });
  outbox.enqueue.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
  });
  const useCase = new ReconcileConsentUseCase(
    repository,
    outbox,
    mockUnitOfWork().unitOfWork,
    mockInstrumentation(),
  );

  return { repository, outbox, seen, useCase };
}

describe("reconcile a browser consent with the account at sign-in", () => {
  it("attaches the orphan records to the user and announces it in the same transaction", async () => {
    const { repository, outbox, seen, useCase } = given(["c1", "c2"]);

    const result = await useCase.execute({ subjectId: "subj-1", userId: "u1" });

    expect(result.isSuccess).toBe(true);
    expect(repository.linkSubjectToUser).toHaveBeenCalledWith("subj-1", "u1");
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.USER_COOKIE_CONSENT_LINKED,
        aggregateId: "u1",
        payload: { userId: "u1", subjectId: "subj-1", consentRecordIds: ["c1", "c2"] },
      },
    ]);
    expect(seen[0]).toBeDefined();
    expect(seen).toEqual([seen[0], seen[0]]);
  });

  it("announces nothing when every record was already linked", async () => {
    const { outbox, useCase } = given([]);

    const result = await useCase.execute({ subjectId: "subj-1", userId: "u1" });

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("fails with the store error and announces nothing when the link cannot be written", async () => {
    const { repository, outbox, useCase } = given([]);
    repository.linkSubjectToUser.mockResolvedValue(
      Result.fail({ code: "CONSENT_PROVIDER_FAILURE", message: "db error" }),
    );

    const result = await useCase.execute({ subjectId: "subj-1", userId: "u1" });

    expect(result.getError().code).toBe("CONSENT_PROVIDER_FAILURE");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

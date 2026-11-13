import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { CONSENT_REFUSAL_TTL_DAYS, COOKIE_CONSENT_VERSION } from "@packages/cookie-consent";
import { Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IConsentRepository } from "../../../application/ports/repositories/consent.port";
import { ConsentLedger } from "../../../application/services/consent-ledger.service";
import { WithdrawConsentUseCase } from "../../../application/usecases/withdraw-consent/withdraw-consent.usecase";

const NOW = new Date("2026-03-01T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function given() {
  const repository = mockPort<IConsentRepository>();
  const outbox = mockPort<IOutboxRepository>();
  const seen: unknown[] = [];
  repository.insert.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
    return Result.ok();
  });
  outbox.enqueue.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
  });
  const ledger = new ConsentLedger(
    repository,
    outbox,
    mockUnitOfWork().unitOfWork,
    mockInstrumentation(),
  );

  return { repository, outbox, seen, useCase: new WithdrawConsentUseCase(ledger) };
}

describe("withdraw a cookie consent", () => {
  beforeEach(() => setSystemTime(NOW));
  afterEach(() => setSystemTime());

  it("appends a refusal kept for the refusal lifetime and announces it in the same transaction", async () => {
    const { repository, outbox, seen, useCase } = given();

    const result = await useCase.execute({ subjectId: "subj-1", userId: Option.some("u1") });

    expect(result.isSuccess).toBe(true);
    expect(repository.insert.mock.calls[0]?.[0]).toMatchObject({
      subjectId: "subj-1",
      userId: Option.some("u1"),
      categories: [],
      policyVersion: COOKIE_CONSENT_VERSION,
      withdrawnAt: Option.some(NOW),
      expiresAt: new Date(NOW.getTime() + CONSENT_REFUSAL_TTL_DAYS * DAY_MS),
      ipAddress: Option.none(),
      userAgent: Option.none(),
    });
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.USER_COOKIE_CONSENT_WITHDRAWN,
        aggregateId: "u1",
        payload: {
          userId: "u1",
          subjectId: "subj-1",
          categories: [],
          policyVersion: COOKIE_CONSENT_VERSION,
        },
      },
    ]);
    expect(seen[0]).toBeDefined();
    expect(seen).toEqual([seen[0], seen[0]]);
  });

  it("fails with the store error and announces nothing when the refusal cannot be written", async () => {
    const { repository, outbox, useCase } = given();
    repository.insert.mockResolvedValue(
      Result.fail({ code: "CONSENT_PROVIDER_FAILURE", message: "db error" }),
    );

    const result = await useCase.execute({ subjectId: "subj-1", userId: Option.none() });

    expect(result.getError().code).toBe("CONSENT_PROVIDER_FAILURE");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

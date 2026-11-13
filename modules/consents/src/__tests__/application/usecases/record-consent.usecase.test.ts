import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { CONSENT_GRANT_TTL_DAYS, COOKIE_CONSENT_VERSION } from "@packages/cookie-consent";
import { Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IConsentRepository } from "../../../application/ports/repositories/consent.port";
import { ConsentLedger } from "../../../application/services/consent-ledger.service";
import type { RecordConsentInput } from "../../../application/usecases/record-consent/record-consent.dto";
import { RecordConsentUseCase } from "../../../application/usecases/record-consent/record-consent.usecase";

const NOW = new Date("2026-03-01T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function given() {
  const repository = mockPort<IConsentRepository>();
  const outbox = mockPort<IOutboxRepository>();
  const uow = mockUnitOfWork();
  const seen: unknown[] = [];
  repository.insert.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
    return Result.ok();
  });
  outbox.enqueue.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
  });
  const ledger = new ConsentLedger(repository, outbox, uow.unitOfWork, mockInstrumentation());

  return { repository, outbox, uow, seen, useCase: new RecordConsentUseCase(ledger) };
}

const consent: RecordConsentInput = {
  subjectId: Option.some("subj-1"),
  userId: Option.none(),
  categories: ["analytics"],
  ipAddress: Option.some("1.2.3.4"),
  userAgent: Option.none(),
};

describe("record a cookie consent", () => {
  beforeEach(() => setSystemTime(NOW));
  afterEach(() => setSystemTime());

  it("records the choice with 'necessary' always granted and announces it in the same transaction", async () => {
    const { repository, outbox, uow, seen, useCase } = given();

    const result = await useCase.execute(consent);

    expect(result.getValue()).toEqual({
      subjectId: "subj-1",
      categories: ["necessary", "analytics"],
      policyVersion: COOKIE_CONSENT_VERSION,
    });
    expect(repository.insert.mock.calls[0]?.[0]).toMatchObject({
      subjectId: "subj-1",
      userId: Option.none(),
      categories: ["necessary", "analytics"],
      policyVersion: COOKIE_CONSENT_VERSION,
      withdrawnAt: Option.none(),
      expiresAt: new Date(NOW.getTime() + CONSENT_GRANT_TTL_DAYS * DAY_MS),
      ipAddress: Option.some("1.2.3.4"),
      userAgent: Option.none(),
    });
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.USER_COOKIE_CONSENT_GRANTED,
        aggregateId: "subj-1",
        payload: {
          userId: undefined,
          subjectId: "subj-1",
          categories: ["necessary", "analytics"],
          policyVersion: COOKIE_CONSENT_VERSION,
          ipAddress: "1.2.3.4",
          userAgent: undefined,
        },
      },
    ]);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeDefined();
    expect(seen[1]).toBe(seen[0]);
    expect(uow.outcome()).toBe("committed");
  });

  it("keeps 'necessary' once when the choice already holds it", async () => {
    const { useCase } = given();

    const result = await useCase.execute({ ...consent, categories: ["necessary", "marketing"] });

    expect(result.getValue().categories).toEqual(["necessary", "marketing"]);
  });

  it("attributes the consent of a signed-in user to the account", async () => {
    const { outbox, useCase } = given();

    await useCase.execute({ ...consent, userId: Option.some("u1") });

    expect(enqueuedEvents(outbox)).toEqual([
      expect.objectContaining({
        aggregateId: "u1",
        payload: expect.objectContaining({ userId: "u1" }),
      }),
    ]);
  });

  it("mints a subject for a browser that has none yet", async () => {
    const { repository, useCase } = given();

    const result = await useCase.execute({ ...consent, subjectId: Option.none() });

    const minted = result.getValue().subjectId;
    expect(minted).toMatch(/^[0-9a-f-]{36}$/);
    expect(repository.insert.mock.calls[0]?.[0].subjectId).toBe(minted);
  });

  it("fails with the store error and announces nothing when the record cannot be written", async () => {
    const { repository, outbox, useCase } = given();
    repository.insert.mockResolvedValue(
      Result.fail({ code: "CONSENT_PROVIDER_FAILURE", message: "db error" }),
    );

    const result = await useCase.execute(consent);

    expect(result.getError().code).toBe("CONSENT_PROVIDER_FAILURE");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("fails cleanly when the announcement cannot be written", async () => {
    const { outbox, uow, useCase } = given();
    outbox.enqueue.mockRejectedValue(new Error("outbox down"));

    const result = await useCase.execute(consent);

    expect(result.getError()).toEqual({
      code: "CONSENT_PROVIDER_FAILURE",
      message: "consent record failed",
    });
    expect(uow.outcome()).toBe("rolled_back");
  });
});

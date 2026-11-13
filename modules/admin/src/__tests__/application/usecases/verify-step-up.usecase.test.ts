import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { type ILogger, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IStepUpStore } from "../../../application/ports/repositories/step-up-store.port";
import type {
  ITotpVerifier,
  TotpOutcome,
} from "../../../application/ports/services/totp-verifier.port";
import { VerifyStepUpUseCase } from "../../../application/usecases/verify-step-up/verify-step-up.usecase";

const ATTEMPT = {
  userId: "u1",
  sessionId: "s1",
  code: "123456",
  ip: "203.0.113.9",
};
const TTL_SECONDS = 300;
const NOW = new Date("2026-10-30T12:00:00Z");

function setup(given: { totp?: TotpOutcome; sessionLive?: boolean }) {
  const store = mockPort<IStepUpStore>();
  store.record.mockImplementation(async () => Result.ok(given.sessionLive ?? true));

  const totp = mockPort<ITotpVerifier>();
  totp.consume.mockImplementation(async () => Result.ok(given.totp ?? "accepted"));

  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});

  const { unitOfWork, outcome } = mockUnitOfWork();
  const useCase = new VerifyStepUpUseCase(
    store,
    totp,
    outbox,
    unitOfWork,
    { ADMIN_STEP_UP_TTL_SECONDS: TTL_SECONDS },
    mockPort<ILogger>(),
  );

  return { useCase, store, outbox, outcome };
}

afterEach(() => {
  setSystemTime();
});

describe("VerifyStepUpUseCase", () => {
  it("records the step-up and announces it when the code is fresh", async () => {
    setSystemTime(NOW);
    const { useCase, store, outbox } = setup({});

    const result = await useCase.execute(ATTEMPT);

    expect(result.getValue().validUntil).toEqual(new Date(NOW.getTime() + TTL_SECONDS * 1000));
    expect(store.record).toHaveBeenCalledWith("s1", NOW);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.ADMIN_STEP_UP_VERIFIED,
        aggregateId: "u1",
        payload: {
          userId: "u1",
          validUntil: new Date(NOW.getTime() + TTL_SECONDS * 1000).toISOString(),
          ip: ATTEMPT.ip,
        },
      },
    ]);
  });

  it("answers that two-factor is needed when no secret is enrolled", async () => {
    const { useCase, store, outbox } = setup({ totp: "not_enrolled" });

    const result = await useCase.execute(ATTEMPT);

    expect(result.getError().code).toBe("ADMIN_STEP_UP_MFA_FORBIDDEN");
    expect(enqueuedEvents(outbox)).toEqual([]);
    expect(store.record).not.toHaveBeenCalled();
  });

  it("refuses a wrong code, records nothing and announces the failure", async () => {
    const { useCase, store, outbox } = setup({ totp: "invalid" });

    const result = await useCase.execute(ATTEMPT);

    expect(result.getError().code).toBe("ADMIN_STEP_UP_CODE_INVALID");
    expect(store.record).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.ADMIN_STEP_UP_FAILED,
        aggregateId: "u1",
        payload: { userId: "u1", reason: "invalid_code", ip: ATTEMPT.ip },
      },
    ]);
  });

  it("refuses a replayed code, records nothing and announces the failure", async () => {
    const { useCase, store, outbox } = setup({ totp: "replayed" });

    const result = await useCase.execute(ATTEMPT);

    expect(result.getError().code).toBe("ADMIN_STEP_UP_REPLAY_INVALID");
    expect(store.record).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox).map((e) => e.payload)).toEqual([
      { userId: "u1", reason: "replayed_code", ip: ATTEMPT.ip },
    ]);
  });

  it("rolls back the consumed code when the session has ended", async () => {
    const { useCase, outcome } = setup({ sessionLive: false });

    const result = await useCase.execute(ATTEMPT);

    expect(result.getError().code).toBe("ADMIN_STEP_UP_SESSION_NOT_FOUND");
    expect(outcome()).toBe("rolled_back");
  });
});

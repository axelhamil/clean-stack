import { type AppError, type IUnitOfWork, type Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent, emitEventBestEffort } from "../../../../shared/event-emitter";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type {
  ITotpVerifier,
  TotpOutcome,
  TotpVerifierError,
} from "../../../../shared/ports/totp-verifier.port";
import type { IStepUpStore, StepUpStoreError } from "../ports/step-up-store.port";

export type StepUpError =
  | StepUpStoreError
  | TotpVerifierError
  | AppError<"ADMIN_STEP_UP_MFA_FORBIDDEN">
  | AppError<"ADMIN_STEP_UP_CODE_INVALID">
  | AppError<"ADMIN_STEP_UP_REPLAY_INVALID">
  | AppError<"ADMIN_STEP_UP_SESSION_NOT_FOUND">;

export interface StepUpEnv {
  ADMIN_STEP_UP_TTL_SECONDS: number;
}

interface StepUpAttempt {
  userId: string;
  sessionId: string;
  code: string;
  ip: string | null;
}

type FailureReason = "invalid_code" | "replayed_code";

const REFUSALS: Record<TotpOutcome, StepUpError | undefined> = {
  accepted: undefined,
  invalid: { code: "ADMIN_STEP_UP_CODE_INVALID", message: "This code is not valid." },
  replayed: {
    code: "ADMIN_STEP_UP_REPLAY_INVALID",
    message: "This code was already used. Wait for the next one.",
  },
  not_enrolled: {
    code: "ADMIN_STEP_UP_MFA_FORBIDDEN",
    message: "Turn on two-factor authentication to confirm this action.",
  },
};

export class StepUpService {
  constructor(
    private readonly store: IStepUpStore,
    private readonly totp: ITotpVerifier,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly env: StepUpEnv,
  ) {}

  async validUntil(sessionId: string): Promise<Result<Option<Date>, StepUpStoreError>> {
    const found = await this.store.findVerifiedAt(sessionId);
    if (found.isFailure) return Result.fail(found.getError());

    const now = Date.now();

    return Result.ok(
      found
        .getValue()
        .map((verifiedAt) => this.expiryOf(verifiedAt))
        .filter((expiry) => expiry.getTime() > now),
    );
  }

  async verify(input: StepUpAttempt): Promise<Result<{ validUntil: Date }, StepUpError>> {
    const outcome = await this.uow.run(
      async (): Promise<Result<{ validUntil: Date }, StepUpError>> => {
        const consumed = await this.totp.consume(input.userId, input.code);
        if (consumed.isFailure) return Result.fail(consumed.getError());

        const refusal = REFUSALS[consumed.getValue()];
        if (refusal) return Result.fail(refusal);

        const verifiedAt = new Date();
        const recorded = await this.store.record(input.sessionId, verifiedAt);
        if (recorded.isFailure) return Result.fail(recorded.getError());
        if (!recorded.getValue()) {
          return Result.fail({
            code: "ADMIN_STEP_UP_SESSION_NOT_FOUND",
            message: "This session has ended.",
          });
        }

        const validUntil = this.expiryOf(verifiedAt);
        await emitEvent(this.outbox, EventTypes.ADMIN_STEP_UP_VERIFIED, "user", input.userId, {
          userId: input.userId,
          validUntil: validUntil.toISOString(),
          ip: input.ip,
        });

        return Result.ok({ validUntil });
      },
    );
    if (outcome.isSuccess) return outcome;

    const code = outcome.getError().code;
    if (code === "ADMIN_STEP_UP_CODE_INVALID") await this.announceFailure(input, "invalid_code");
    if (code === "ADMIN_STEP_UP_REPLAY_INVALID") await this.announceFailure(input, "replayed_code");

    return outcome;
  }

  private announceFailure(input: StepUpAttempt, reason: FailureReason): Promise<void> {
    return emitEventBestEffort(
      this.outbox,
      EventTypes.ADMIN_STEP_UP_FAILED,
      "user",
      input.userId,
      { userId: input.userId, reason, ip: input.ip },
      "step-up failure event could not be written",
      { userId: input.userId },
    );
  }

  private expiryOf(verifiedAt: Date): Date {
    return new Date(verifiedAt.getTime() + this.env.ADMIN_STEP_UP_TTL_SECONDS * 1000);
  }
}

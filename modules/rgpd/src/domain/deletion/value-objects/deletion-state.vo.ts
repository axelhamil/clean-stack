import { type AppError, Option, Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

const deletionStateSchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("active") }),
  z.object({ phase: z.literal("pending"), until: z.date() }),
  z.object({ phase: z.literal("wiped"), at: z.date() }),
]);

export type DeletionStateValue = z.infer<typeof deletionStateSchema>;

export type DeletionStateInvalid = AppError<"RGPD_DELETION_STATE_INVALID">;

const STATE_INVALID: DeletionStateInvalid = {
  code: "RGPD_DELETION_STATE_INVALID",
  message: "A deletion state is active, pending until a date, or wiped at a date.",
};

export class DeletionState extends ValueObject<DeletionStateValue, DeletionStateInvalid> {
  static of(
    pendingDeletionUntil: Option<Date>,
    deletedAt: Option<Date>,
  ): Result<DeletionState, DeletionStateInvalid> {
    if (deletedAt.isSome()) return DeletionState.create({ phase: "wiped", at: deletedAt.unwrap() });
    if (pendingDeletionUntil.isSome())
      return DeletionState.create({ phase: "pending", until: pendingDeletionUntil.unwrap() });

    return DeletionState.create({ phase: "active" });
  }

  isWiped(): boolean {
    return this.value.phase === "wiped";
  }

  pendingUntil(): Option<Date> {
    return this.value.phase === "pending" ? Option.some(this.value.until) : Option.none();
  }

  protected validate(value: DeletionStateValue): Result<DeletionStateValue, DeletionStateInvalid> {
    return deletionStateSchema.safeParse(value).success
      ? Result.ok(value)
      : Result.fail(STATE_INVALID);
  }
}

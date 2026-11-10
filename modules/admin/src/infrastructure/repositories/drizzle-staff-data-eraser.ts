import { type AppError, type IInstrumentation, Result } from "@packages/ddd-kit";
import { dbOperationFailure, eq, resolveExecutor } from "@packages/drizzle";
import * as staffSchema from "../../../schemas/staff";

const { staffNote, savedView } = staffSchema;
const failure = dbOperationFailure("ADMIN_STAFF_PROVIDER_FAILURE");

export class DrizzleStaffDataEraser {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async eraseDataOf(
    userId: string,
  ): Promise<Result<void, AppError<"ADMIN_STAFF_PROVIDER_FAILURE">>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStaffDataEraser > eraseDataOf" },
      async () => {
        try {
          await exec.delete(staffNote).where(eq(staffNote.userId, userId));
          await exec.delete(savedView).where(eq(savedView.ownerId, userId));

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("erase staff data"));
        }
      },
    );
  }
}

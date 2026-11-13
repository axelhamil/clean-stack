import type { IInstrumentation, Result } from "@packages/ddd-kit";
import type {
  IStaffStore,
  StaffStoreError,
} from "../../application/ports/repositories/staff-store.port";
import type { ICountExpiredImpersonationsQuery } from "../../application/queries/count-expired-impersonations.query";

export class ExpiredImpersonationCountQuery implements ICountExpiredImpersonationsQuery {
  constructor(
    private readonly store: IStaffStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute(): Promise<Result<number, StaffStoreError>> {
    return this.instrumentation.startSpan(
      { name: "ExpiredImpersonationCountQuery > execute" },
      () => this.store.countExpiredImpersonations(),
    );
  }
}

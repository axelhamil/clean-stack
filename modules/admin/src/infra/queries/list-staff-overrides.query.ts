import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import type {
  IStaffStore,
  StaffOverrideRow,
  StaffStoreError,
} from "../../application/ports/repositories/staff-store.port";
import type { IListStaffOverridesQuery } from "../../application/queries/list-staff-overrides.query";
import {
  grantsStaffAccess,
  type StaffListing,
} from "../../domain/staff/services/staff-access.service";

export class StaffOverrideListQuery implements IListStaffOverridesQuery {
  constructor(
    private readonly store: IStaffStore,
    private readonly env: StaffListing,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute({
    userId,
  }: {
    userId: string;
  }): Promise<Result<Option<StaffOverrideRow[]>, StaffStoreError>> {
    return this.instrumentation.startSpan(
      { name: "StaffOverrideListQuery > execute" },
      async () => {
        const found = await this.store.findActive(userId);
        if (found.isFailure) return Result.fail(found.getError());

        const isStaff = found
          .getValue()
          .filter((row) => grantsStaffAccess(row, this.env))
          .isSome();
        if (!isStaff) return Result.ok(Option.none());

        const live = await this.store.listLiveOverrides(userId);
        if (live.isFailure) return Result.fail(live.getError());

        return Result.ok(Option.some(live.getValue()));
      },
    );
  }
}

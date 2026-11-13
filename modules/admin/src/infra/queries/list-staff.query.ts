import { type IInstrumentation, Result } from "@packages/ddd-kit";
import type {
  IStaffStore,
  StaffListRow,
  StaffStoreError,
} from "../../application/ports/repositories/staff-store.port";
import type { IListStaffQuery } from "../../application/queries/list-staff.query";
import {
  grantsStaffAccess,
  type StaffListing,
} from "../../domain/staff/services/staff-access.service";

export class StaffListQuery implements IListStaffQuery {
  constructor(
    private readonly store: IStaffStore,
    private readonly env: StaffListing,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute(): Promise<Result<StaffListRow[], StaffStoreError>> {
    return this.instrumentation.startSpan({ name: "StaffListQuery > execute" }, async () => {
      const rows = await this.store.listActive();
      if (rows.isFailure) return rows;

      return Result.ok(rows.getValue().filter((row) => grantsStaffAccess(row, this.env)));
    });
  }
}

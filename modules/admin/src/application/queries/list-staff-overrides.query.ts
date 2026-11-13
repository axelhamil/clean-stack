import type { IQuery, Option } from "@packages/ddd-kit";
import type { StaffOverrideRow, StaffStoreError } from "../ports/repositories/staff-store.port";

export type IListStaffOverridesQuery = IQuery<
  { userId: string },
  Option<StaffOverrideRow[]>,
  StaffStoreError
>;

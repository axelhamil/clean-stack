import type { IQuery } from "@packages/ddd-kit";
import type { StaffListRow, StaffStoreError } from "../ports/repositories/staff-store.port";

export type IListStaffQuery = IQuery<void, StaffListRow[], StaffStoreError>;

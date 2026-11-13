import type { IQuery } from "@packages/ddd-kit";
import type { StaffStoreError } from "../ports/repositories/staff-store.port";

export type ICountExpiredImpersonationsQuery = IQuery<void, number, StaffStoreError>;

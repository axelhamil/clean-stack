import type { IQuery } from "@packages/ddd-kit";
import type { ApprovalStoreError } from "../ports/repositories/approval-store.port";

export type ICountDueApprovalsQuery = IQuery<void, number, ApprovalStoreError>;

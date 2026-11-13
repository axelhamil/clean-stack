import type { IQuery, Option } from "@packages/ddd-kit";
import type {
  ApprovalRecord,
  ApprovalStoreError,
  ListApprovalsQuery,
} from "../ports/repositories/approval-store.port";

export interface ApprovalPage {
  items: ApprovalRecord[];
  nextCursor: Option<string>;
}

export type IListApprovalsQuery = IQuery<ListApprovalsQuery, ApprovalPage, ApprovalStoreError>;

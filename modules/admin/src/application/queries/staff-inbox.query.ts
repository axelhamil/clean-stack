import type { StaffPermission } from "@packages/access-control";
import type { IQuery, Option, Result } from "@packages/ddd-kit";
import type { SweepRunStoreError } from "@packages/http/sweep-run.port";
import type { ApprovalStoreError, OpenApprovals } from "../ports/repositories/approval-store.port";
import type { OpsStoreError } from "../ports/repositories/ops-store.port";
import type { SweepRunState } from "./list-sweep-runs.query";

export interface InboxQueues {
  deadEvents: number;
  deadEmails: number;
  deadWebhooks: number;
}

export interface Inbox {
  approvals: Option<Result<OpenApprovals, ApprovalStoreError>>;
  queues: Option<Result<InboxQueues, OpsStoreError>>;
  sweeps: Option<Result<SweepRunState[], SweepRunStoreError>>;
}

export type IStaffInboxQuery = IQuery<{ permissions: readonly StaffPermission[] }, Inbox, never>;

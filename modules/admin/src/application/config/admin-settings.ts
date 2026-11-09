import type { ApprovalAction } from "@packages/access-control";

export interface AdminSettings {
  stepUpTtlSeconds: number;
  approvalEnabled: boolean;
  approvalActions: readonly ApprovalAction[];
  approvalTtlHours: number;
  outboxLeaseSeconds: number;
  supportUrl: string;
}

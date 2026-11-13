import type { StaffPermission, StaffView } from "@packages/access-control";

export interface SaveViewInput {
  actorUserId: string;
  permissions: readonly StaffPermission[];
  view: StaffView;
}

export interface SaveViewOutput {
  id: string;
}

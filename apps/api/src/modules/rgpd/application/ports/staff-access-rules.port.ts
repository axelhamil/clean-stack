import type { AdminImpersonationStoppedPayload } from "@packages/events";
import type { EndedImpersonation, StaffSource } from "../../../../shared/ports/staff-store.port";

export interface IStaffAccessRules {
  isListed(userId: string): boolean;
  grantsStaffAccess(row: { userId: string; source: StaffSource }): boolean;
  isLastManager(
    targetUserId: string,
    managers: ReadonlyArray<{ userId: string; source: StaffSource; manageDenied?: boolean }>,
  ): boolean;
  announceImpersonationsEnded(
    ended: EndedImpersonation[],
    reason: AdminImpersonationStoppedPayload["endReason"],
    now: Date,
  ): Promise<void>;
}

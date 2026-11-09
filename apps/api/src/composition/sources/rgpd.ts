import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import { announceImpersonationsEnded } from "../../modules/admin/application/services/impersonation-end";
import {
  grantsStaffAccess,
  isLastManager,
  type StaffListing,
} from "../../modules/admin/application/services/staff-access";
import type { IStaffAccessRules } from "../../modules/rgpd/application/ports/staff-access-rules.port";

export function staffAccessRules(
  outbox: IOutboxRepository,
  staffSettings: StaffListing,
): IStaffAccessRules {
  return {
    isListed: (userId) => staffSettings.PLATFORM_ADMIN_IDS.includes(userId),
    grantsStaffAccess: (row) => grantsStaffAccess(row, staffSettings),
    isLastManager: (targetUserId, managers) => isLastManager(targetUserId, managers, staffSettings),
    announceImpersonationsEnded: (ended, reason, now) =>
      announceImpersonationsEnded(outbox, ended, reason, now),
  };
}

export interface RgpdSourcesPrerequisites {
  IOutboxRepository: IOutboxRepository;
  staffSettings: StaffListing;
}

export const rgpdSources = defineModule<RgpdSourcesPrerequisites>()((b) =>
  b.add(
    "IStaffAccessRules",
    (c): IStaffAccessRules => staffAccessRules(c.IOutboxRepository, c.staffSettings),
  ),
);

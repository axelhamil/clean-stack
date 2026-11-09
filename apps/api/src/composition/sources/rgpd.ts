import type { IApiTokenRepository } from "@modules/api-token/application/ports/api-token.port";
import type { IApiTokenRevoker } from "@modules/rgpd/application/ports/api-token-revoker.port";
import type { IEndedSessionsReader } from "@modules/rgpd/application/ports/ended-sessions.port";
import type { IStaffAccessRules } from "@modules/rgpd/application/ports/staff-access-rules.port";
import type { IStaffDataEraser } from "@modules/rgpd/application/ports/staff-data-eraser.port";
import type { IInstrumentation } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import { announceImpersonationsEnded } from "../../modules/admin/application/services/impersonation-end";
import {
  grantsStaffAccess,
  isLastManager,
  type StaffListing,
} from "../../modules/admin/application/services/staff-access";
import { DrizzleStaffDataEraser } from "../../modules/admin/infrastructure/repositories/drizzle-staff-data-eraser";
import { endedImpersonationsOf } from "../../shared/db/ended-sessions";

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
  IInstrumentation: IInstrumentation;
  IApiTokenRepository: IApiTokenRepository;
  IOutboxRepository: IOutboxRepository;
  staffSettings: StaffListing;
}

export const rgpdSources = defineModule<RgpdSourcesPrerequisites>()((b) =>
  b
    .add(
      "IStaffAccessRules",
      (c): IStaffAccessRules => staffAccessRules(c.IOutboxRepository, c.staffSettings),
    )
    .add("IApiTokenRevoker", (c): IApiTokenRevoker => c.IApiTokenRepository)
    .add(
      "IStaffDataEraser",
      (c): IStaffDataEraser => new DrizzleStaffDataEraser(c.IInstrumentation),
    )
    .add(
      "IEndedSessionsReader",
      (): IEndedSessionsReader => ({ impersonationsOf: endedImpersonationsOf }),
    ),
);

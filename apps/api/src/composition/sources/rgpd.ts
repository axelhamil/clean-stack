import { DrizzleStaffDataEraser } from "@modules/admin/adapters/drizzle-staff-data-eraser";
import { endedImpersonationsOf } from "@modules/admin/adapters/ended-sessions";
import {
  grantsStaffAccess,
  isLastManager,
  type StaffListing,
} from "@modules/admin/rules/staff-access";
import { announceImpersonationsEnded } from "@modules/admin/services/impersonation-end";
import type { RevokeAllUserTokensUseCase } from "@modules/api-token/usecases/revoke-all-user-tokens";
import type { IApiTokenRevoker } from "@modules/rgpd/ports/api-token-revoker";
import type { IEndedSessionsReader } from "@modules/rgpd/ports/ended-sessions";
import type { IStaffAccessRules } from "@modules/rgpd/ports/staff-access-rules";
import type { IStaffDataEraser } from "@modules/rgpd/ports/staff-data-eraser";
import type { IInstrumentation } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";

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
  RevokeAllUserTokensUseCase: RevokeAllUserTokensUseCase;
  IOutboxRepository: IOutboxRepository;
  staffSettings: StaffListing;
}

export const rgpdSources = defineModule<RgpdSourcesPrerequisites>()((b) =>
  b
    .add(
      "IStaffAccessRules",
      (c): IStaffAccessRules => staffAccessRules(c.IOutboxRepository, c.staffSettings),
    )
    .add("IApiTokenRevoker", (c): IApiTokenRevoker => c.RevokeAllUserTokensUseCase)
    .add(
      "IStaffDataEraser",
      (c): IStaffDataEraser => new DrizzleStaffDataEraser(c.IInstrumentation),
    )
    .add(
      "IEndedSessionsReader",
      (): IEndedSessionsReader => ({ impersonationsOf: endedImpersonationsOf }),
    ),
);

import type { AppError, Result } from "@packages/ddd-kit";

export type SsoEnforcementError = AppError<"ADMIN_ACTION_PROVIDER_FAILURE">;

export interface ISsoEnforcement {
  setSsoEnforcement(input: {
    organizationId: string;
    enforced: boolean;
    actorUserId: string;
    viaPlatformAdmin: boolean;
  }): Promise<Result<void, SsoEnforcementError>>;
}

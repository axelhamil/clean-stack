import type { StaffPermission } from "@packages/access-control";
import type { Result } from "@packages/ddd-kit";
import type { PasswordResetDeliveryError } from "../../ports/services/auth-provider.port";

export interface ResetUserPasswordInput {
  actorUserId: string;
  actorPermissions: readonly StaffPermission[];
  userId: string;
  requestReset: () => Promise<Result<void, PasswordResetDeliveryError>>;
}

import type { IUseCase, Result } from "@packages/ddd-kit";
import type { PasswordResetDeliveryError } from "../../ports/services/auth-provider.port";
import type {
  AdminModerationError,
  AdminModerationService,
} from "../../services/admin-moderation.service";
import type { StaffModerationError, StaffService } from "../../services/staff.service";
import type { ResetUserPasswordInput } from "./reset-user-password.dto";

export type ResetUserPasswordError =
  | StaffModerationError
  | AdminModerationError
  | PasswordResetDeliveryError;

export class ResetUserPasswordUseCase
  implements IUseCase<ResetUserPasswordInput, void, ResetUserPasswordError>
{
  constructor(
    private readonly staff: Pick<StaffService, "moderate">,
    private readonly moderation: Pick<AdminModerationService, "resetPassword">,
  ) {}

  execute(input: ResetUserPasswordInput): Promise<Result<void, ResetUserPasswordError>> {
    const { actorUserId, actorPermissions, userId, requestReset } = input;

    return this.staff.moderate({ actorPermissions, targetUserId: userId }, () =>
      this.moderation.resetPassword({ actorUserId, userId }, requestReset),
    );
  }
}

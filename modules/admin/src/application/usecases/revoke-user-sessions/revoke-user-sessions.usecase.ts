import type { IUseCase, Result } from "@packages/ddd-kit";
import type {
  AdminModerationError,
  AdminModerationService,
} from "../../services/admin-moderation.service";
import type { StaffModerationError, StaffService } from "../../services/staff.service";
import type { RevokeUserSessionsInput } from "./revoke-user-sessions.dto";

export type RevokeUserSessionsError = StaffModerationError | AdminModerationError;

export class RevokeUserSessionsUseCase
  implements IUseCase<RevokeUserSessionsInput, void, RevokeUserSessionsError>
{
  constructor(
    private readonly staff: Pick<StaffService, "moderate">,
    private readonly moderation: Pick<AdminModerationService, "revokeSessions">,
  ) {}

  execute(input: RevokeUserSessionsInput): Promise<Result<void, RevokeUserSessionsError>> {
    const { actorUserId, actorPermissions, userId } = input;

    return this.staff.moderate({ actorPermissions, targetUserId: userId }, () =>
      this.moderation.revokeSessions({ actorUserId, userId }),
    );
  }
}

import type { IUseCase, Result } from "@packages/ddd-kit";
import type {
  AdminModerationError,
  AdminModerationService,
} from "../../services/admin-moderation.service";
import type { StaffModerationError, StaffService } from "../../services/staff.service";
import type { UnbanUserInput } from "./unban-user.dto";

export type UnbanUserError = StaffModerationError | AdminModerationError;

export class UnbanUserUseCase implements IUseCase<UnbanUserInput, void, UnbanUserError> {
  constructor(
    private readonly staff: Pick<StaffService, "moderate">,
    private readonly moderation: Pick<AdminModerationService, "unban">,
  ) {}

  execute(input: UnbanUserInput): Promise<Result<void, UnbanUserError>> {
    const { actorUserId, actorPermissions, userId } = input;

    return this.staff.moderate({ actorPermissions, targetUserId: userId }, () =>
      this.moderation.unban({ actorUserId, userId }),
    );
  }
}

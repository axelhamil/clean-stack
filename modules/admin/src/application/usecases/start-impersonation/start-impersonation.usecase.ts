import type { AppError, IUseCase, Result } from "@packages/ddd-kit";
import type {
  ImpersonationRefusedError,
  SessionCookies,
} from "../../ports/services/auth-provider.port";
import type { AdminModerationService } from "../../services/admin-moderation.service";
import type { StartImpersonationInput } from "./start-impersonation.dto";

export type StartImpersonationError =
  | ImpersonationRefusedError
  | AppError<"ADMIN_IMPERSONATION_SELF_FORBIDDEN">;

export class StartImpersonationUseCase
  implements IUseCase<StartImpersonationInput, SessionCookies, StartImpersonationError>
{
  constructor(private readonly moderation: Pick<AdminModerationService, "startImpersonation">) {}

  execute(
    input: StartImpersonationInput,
  ): Promise<Result<SessionCookies, StartImpersonationError>> {
    const { start, ...subject } = input;

    return this.moderation.startImpersonation(subject, start);
  }
}

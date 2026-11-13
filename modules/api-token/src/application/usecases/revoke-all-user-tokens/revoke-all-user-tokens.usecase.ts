import { type IUseCase, Option, type Result } from "@packages/ddd-kit";
import type {
  ApiTokenError,
  IApiTokenRepository,
  RevokedToken,
} from "../../ports/repositories/api-token.port";
import type { RevokeAllUserTokensInput } from "./revoke-all-user-tokens.dto";

export class RevokeAllUserTokensUseCase
  implements IUseCase<RevokeAllUserTokensInput, RevokedToken[], ApiTokenError>
{
  constructor(private readonly repo: IApiTokenRepository) {}

  execute(input: RevokeAllUserTokensInput): Promise<Result<RevokedToken[], ApiTokenError>> {
    return this.repo.revokeAllOfUser({
      userId: input.userId,
      organizationId: Option.none(),
      reason: "user",
    });
  }
}

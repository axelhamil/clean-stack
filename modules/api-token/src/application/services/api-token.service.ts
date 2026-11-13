import type { Result } from "@packages/ddd-kit";
import type { ApiTokenError, RevokedToken } from "../ports/repositories/api-token.port";
import type { RevokeAllUserTokensUseCase } from "../usecases/revoke-all-user-tokens/revoke-all-user-tokens.usecase";

export class ApiTokenService {
  constructor(private readonly revokeAllUserTokens: RevokeAllUserTokensUseCase) {}

  revokeAllOfUser(userId: string): Promise<Result<RevokedToken[], ApiTokenError>> {
    return this.revokeAllUserTokens.execute({ userId });
  }
}

import { type IInstrumentation, type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { ApiTokenId } from "../../../domain/api-token/api-token-id";
import type { ApiTokenError, IApiTokenRepository } from "../../ports/repositories/api-token.port";
import type { RevokeApiTokenInput } from "./revoke-api-token.dto";

export class RevokeApiTokenUseCase implements IUseCase<RevokeApiTokenInput, void, ApiTokenError> {
  constructor(
    private readonly repo: IApiTokenRepository,
    private readonly uow: IUnitOfWork,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async execute(input: RevokeApiTokenInput): Promise<Result<void, ApiTokenError>> {
    const found = await this.repo.findByIdForOwner(new ApiTokenId(input.id), input.owner);
    if (found.isFailure) return Result.fail(found.getError());

    const candidate = found.getValue();
    if (candidate.isNone()) {
      return Result.fail({ code: "API_TOKEN_NOT_FOUND", message: "Token not found." });
    }

    const token = candidate.unwrap();
    if (token.revoke("user", input.actorUserId, new Date()).isFailure) return Result.ok();

    try {
      const written = await this.uow.run(() => this.repo.revoke(token));

      return written.isFailure ? Result.fail(written.getError()) : Result.ok();
    } catch (err) {
      this.instrumentation.capture(err);
      return Result.fail({
        code: "API_TOKEN_PROVIDER_FAILURE",
        message: "Failed to revoke API token.",
      });
    }
  }
}

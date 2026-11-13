import { EventCollector, type IUnitOfWork, type IUseCase, Option, Result } from "@packages/ddd-kit";
import { apiTokenRevokedEvent } from "../../../domain/api-token/events/api-token-revoked.event";
import type { ApiTokenError, IApiTokenRepository } from "../../ports/repositories/api-token.port";
import type { RevokeMembershipTokensInput } from "./revoke-membership-tokens.dto";

export class RevokeMembershipTokensUseCase
  implements IUseCase<RevokeMembershipTokensInput, void, ApiTokenError>
{
  constructor(
    private readonly repo: IApiTokenRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  execute(input: RevokeMembershipTokensInput): Promise<Result<void, ApiTokenError>> {
    const { userId, organizationId, actorUserId } = input;

    return this.uow.run(async (): Promise<Result<void, ApiTokenError>> => {
      const revoked = await this.repo.revokeAllOfUser({
        userId,
        organizationId: Option.some(organizationId),
        reason: "membership_lost",
      });
      if (revoked.isFailure) return Result.fail(revoked.getError());

      const now = new Date();
      EventCollector.add(
        revoked
          .getValue()
          .map(({ tokenId }) =>
            apiTokenRevokedEvent(
              { userId, actorUserId, organizationId, tokenId, reason: "membership_lost" },
              now,
            ),
          ),
      );

      return Result.ok();
    });
  }
}

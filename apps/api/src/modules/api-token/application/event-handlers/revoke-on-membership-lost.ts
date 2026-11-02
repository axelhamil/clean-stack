import {
  type EventHandler,
  type IDomainEvent,
  type IUnitOfWork,
  onEvent,
  Result,
} from "@packages/ddd-kit";
import { EventTypes, OrgMemberRemovedPayload } from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import type { ApiTokenError, IApiTokenRepository } from "../../../../shared/ports/api-token.port";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";

interface Deps {
  IApiTokenRepository: IApiTokenRepository;
  IOutboxRepository: IOutboxRepository;
  ITransactionService: IUnitOfWork;
}

export const revokeTokensOnMembershipLost: (deps: Deps) => EventHandler = onEvent(
  EventTypes.ORG_MEMBER_REMOVED,
  "revoke-api-tokens-on-membership-lost",
  (c: Deps) => async (event: IDomainEvent) => {
    const parsed = OrgMemberRemovedPayload.safeParse(event.payload);
    if (!parsed.success) return Result.ok();

    const { userId, organizationId, actorUserId } = parsed.data;

    return c.ITransactionService.run(async (): Promise<Result<void, ApiTokenError>> => {
      const result = await c.IApiTokenRepository.revokeAllForMembership(userId, organizationId);
      if (result.isFailure) return Result.fail(result.getError());

      for (const tokenId of result.getValue()) {
        await emitEvent(
          c.IOutboxRepository,
          EventTypes.API_TOKEN_REVOKED,
          "api_token",
          tokenId,
          {
            userId,
            actorUserId,
            organizationId,
            tokenId,
            reason: "membership_lost" as const,
          },
          { organizationId },
        );
      }

      return Result.ok();
    });
  },
);

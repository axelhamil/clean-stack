import {
  type EventHandler,
  type IDomainEvent,
  type IUnitOfWork,
  onEvent,
  Result,
} from "@packages/ddd-kit";
import { EventTypes, PayloadByEventType } from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import { payloadParser } from "../../../../shared/payload-parser";
import type { ApiTokenError, IApiTokenRepository } from "../../../../shared/ports/api-token.port";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";

interface Deps {
  IApiTokenRepository: IApiTokenRepository;
  IOutboxRepository: IOutboxRepository;
  ITransactionService: IUnitOfWork;
}

const parsePayload = payloadParser(PayloadByEventType[EventTypes.ORG_MEMBER_REMOVED]);

export const revokeTokensOnMembershipLost: (deps: Deps) => EventHandler = onEvent(
  EventTypes.ORG_MEMBER_REMOVED,
  "revoke-api-tokens-on-membership-lost",
  (c: Deps) => async (_event: IDomainEvent, payload) => {
    const { userId, organizationId, actorUserId } = payload;

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
  { payload: parsePayload },
);

import { type EventHandler, type IDomainEvent, type IUnitOfWork, onEvent } from "@packages/ddd-kit";
import { EventTypes, OrgMemberRemovedPayload } from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type { ITransaction } from "../../../../shared/transaction";
import type { IApiTokenRepository } from "../ports/api-token.port";

interface Deps {
  IApiTokenRepository: IApiTokenRepository;
  IOutboxRepository: IOutboxRepository;
  ITransactionService: IUnitOfWork<ITransaction>;
  IInstrumentation: IInstrumentation;
}

export const revokeTokensOnMembershipLost: (deps: Deps) => EventHandler = onEvent(
  EventTypes.ORG_MEMBER_REMOVED,
  (c: Deps) => async (event: IDomainEvent) => {
    const parsed = OrgMemberRemovedPayload.safeParse(event.payload);
    if (!parsed.success) return;

    const { userId, organizationId, actorUserId } = parsed.data;

    try {
      await c.ITransactionService.run(async (tx) => {
        const result = await c.IApiTokenRepository.revokeAllForMembership(
          userId,
          organizationId,
          tx,
        );
        if (result.isFailure) return;

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
            tx,
          );
        }
      });
    } catch (err) {
      c.IInstrumentation.capture(err);
    }
  },
);

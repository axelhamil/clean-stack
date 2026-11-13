import { dispatchTo, type EventHandler, type IUseCase, onEvent } from "@packages/ddd-kit";
import { EventTypes, PayloadByEventType } from "@packages/events";
import { payloadParser } from "@packages/outbox/payload-parser";
import type { RevokeMembershipTokensInput } from "../usecases/revoke-membership-tokens/revoke-membership-tokens.dto";

interface Deps {
  RevokeMembershipTokensUseCase: IUseCase<RevokeMembershipTokensInput, void, unknown>;
}

const parsePayload = payloadParser(PayloadByEventType[EventTypes.ORG_MEMBER_REMOVED]);

export const revokeTokensOnMembershipLost: (deps: Deps) => EventHandler = onEvent(
  EventTypes.ORG_MEMBER_REMOVED,
  "revoke-api-tokens-on-membership-lost",
  (c: Deps) =>
    dispatchTo(
      c.RevokeMembershipTokensUseCase,
      ({ userId, organizationId, actorUserId }: RevokeMembershipTokensInput) => ({
        userId,
        organizationId,
        actorUserId,
      }),
    ),
  { payload: parsePayload },
);

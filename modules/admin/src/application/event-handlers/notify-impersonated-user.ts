import {
  dispatchTo,
  type EventHandler,
  type IDomainEvent,
  type IUseCase,
  onEvent,
} from "@packages/ddd-kit";
import { EventTypes, PayloadByEventType } from "@packages/events";
import { payloadParser } from "@packages/outbox/payload-parser";
import type {
  NotifyImpersonatedUserError,
  NotifyImpersonatedUserInput,
} from "../usecases/notify-impersonated-user/notify-impersonated-user.dto";
import { NOTIFY_IMPERSONATED_USER } from "../usecases/notify-impersonated-user/notify-impersonated-user.usecase";

interface NotifyImpersonatedUserDeps {
  NotifyImpersonatedUserUseCase: IUseCase<
    NotifyImpersonatedUserInput,
    void,
    NotifyImpersonatedUserError
  >;
}

type ImpersonationNotice = Omit<NotifyImpersonatedUserInput, "event">;

const parsePayload = payloadParser(PayloadByEventType[EventTypes.ADMIN_IMPERSONATION_STARTED]);

export const notifyImpersonatedUser: (deps: NotifyImpersonatedUserDeps) => EventHandler = onEvent(
  EventTypes.ADMIN_IMPERSONATION_STARTED,
  NOTIFY_IMPERSONATED_USER,
  (c: NotifyImpersonatedUserDeps) =>
    dispatchTo(
      c.NotifyImpersonatedUserUseCase,
      ({ userId, reason, expiresAt }: ImpersonationNotice, event: IDomainEvent) => ({
        userId,
        reason,
        expiresAt,
        event,
      }),
    ),
  { payload: parsePayload },
);

import { type EventHandler, type IDomainEvent, onEvent, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { EventTypes, PayloadByEventType } from "@packages/events";
import { handlerIdempotency } from "@packages/outbox/handler-idempotency";
import { payloadParser } from "@packages/outbox/payload-parser";
import type { ILocaleReader } from "../ports/services/locale-reader.port";
import type { AdminQueryService } from "../services/admin-query.service";

interface NotifyImpersonatedUserDeps {
  IEmailService: IEmailService;
  AdminQueryService: AdminQueryService;
  ILocaleReader: ILocaleReader;
  supportUrl: string;
}

const FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const HANDLER_NAME = "notify-impersonated-user";

const parsePayload = payloadParser(PayloadByEventType[EventTypes.ADMIN_IMPERSONATION_STARTED]);

export const notifyImpersonatedUser: (deps: NotifyImpersonatedUserDeps) => EventHandler = onEvent(
  EventTypes.ADMIN_IMPERSONATION_STARTED,
  HANDLER_NAME,
  (c: NotifyImpersonatedUserDeps) => async (event: IDomainEvent, payload) => {
    const found = await c.AdminQueryService.getUser(payload.userId);
    if (found.isFailure) return Result.fail(found.getError());

    const target = found.getValue();
    if (target.isNone()) return Result.ok();

    const user = target.unwrap();
    const locale = await c.ILocaleReader.localeOf(payload.userId);
    return c.IEmailService.sendTemplate(
      "impersonation_started",
      user.email,
      {
        userName: user.name,
        startedAt: event.dateOccurred.toLocaleString(locale, FORMAT),
        expiresAt: new Date(payload.expiresAt).toLocaleString(locale, FORMAT),
        reason: payload.reason,
        supportUrl: c.supportUrl,
      },
      { locale, ...handlerIdempotency(HANDLER_NAME, event) },
    );
  },
  { payload: parsePayload },
);

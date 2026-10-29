import { type EventHandler, type IDomainEvent, onEvent, Result } from "@packages/ddd-kit";
import { AdminImpersonationStartedPayload, EventTypes } from "@packages/events";
import { handlerIdempotency } from "../../../../shared/handler-idempotency";
import { localeForUser } from "../../../../shared/locale-for-user";
import type { IEmailService } from "../../../../shared/ports/email.port";
import type { IProfileStore } from "../../../../shared/ports/profile.port";
import type { AdminQueryService } from "../services/admin-query.service";

interface NotifyImpersonatedUserDeps {
  IEmailService: IEmailService;
  AdminQueryService: AdminQueryService;
  IProfileStore: IProfileStore;
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

export const notifyImpersonatedUser: (deps: NotifyImpersonatedUserDeps) => EventHandler = onEvent(
  EventTypes.ADMIN_IMPERSONATION_STARTED,
  HANDLER_NAME,
  (c: NotifyImpersonatedUserDeps) => async (event: IDomainEvent) => {
    const parsed = AdminImpersonationStartedPayload.safeParse(event.payload);
    if (!parsed.success) return Result.ok();

    const found = await c.AdminQueryService.getUser(parsed.data.userId);
    if (found.isFailure) return Result.fail(found.getError());

    const target = found.getValue();
    if (target.isNone()) return Result.ok();

    const user = target.unwrap();
    const locale = await localeForUser(c.IProfileStore, parsed.data.userId);
    return c.IEmailService.sendTemplate(
      "impersonation_started",
      user.email,
      {
        userName: user.name,
        startedAt: event.dateOccurred.toLocaleString(locale, FORMAT),
        expiresAt: new Date(parsed.data.expiresAt).toLocaleString(locale, FORMAT),
        reason: parsed.data.reason,
        supportUrl: c.supportUrl,
      },
      { locale, ...handlerIdempotency(HANDLER_NAME, event) },
    );
  },
);

import { type EventHandler, type IDomainEvent, onEvent } from "@packages/ddd-kit";
import { AdminImpersonationStartedPayload, EventTypes } from "@packages/events";
import type { IEmailService } from "../../../../shared/ports/email.port";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { AdminQueryService } from "../services/admin-query.service";

interface NotifyImpersonatedUserDeps {
  IEmailService: IEmailService;
  AdminQueryService: AdminQueryService;
  IInstrumentation: IInstrumentation;
  supportUrl: string;
}

const FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export const notifyImpersonatedUser: (deps: NotifyImpersonatedUserDeps) => EventHandler = onEvent(
  EventTypes.ADMIN_IMPERSONATION_STARTED,
  (c: NotifyImpersonatedUserDeps) => async (event: IDomainEvent) => {
    const parsed = AdminImpersonationStartedPayload.safeParse(event.payload);
    if (!parsed.success) return;

    const found = await c.AdminQueryService.getUser(parsed.data.userId);
    if (found.isFailure) return;
    const target = found.getValue();
    if (target.isNone()) return;
    const user = target.unwrap();

    try {
      const sent = await c.IEmailService.sendTemplate("impersonation_started", user.email, {
        userName: user.name,
        startedAt: event.dateOccurred.toLocaleString("fr-FR", FORMAT),
        expiresAt: new Date(parsed.data.expiresAt).toLocaleString("fr-FR", FORMAT),
        reason: parsed.data.reason,
        supportUrl: c.supportUrl,
      });
      if (sent.isFailure) {
        c.IInstrumentation.capture(sent.getError());
      }
    } catch (err) {
      c.IInstrumentation.capture(err);
    }
  },
);

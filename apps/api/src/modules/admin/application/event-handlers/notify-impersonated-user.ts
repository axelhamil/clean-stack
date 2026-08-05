import { type EventHandler, type IDomainEvent, onEvent } from "@packages/ddd-kit";
import { AdminImpersonationStartedPayload, EventTypes } from "@packages/events";
import type { IEmailService } from "../../../../shared/ports/email.port";
import type { AdminQueryService } from "../services/admin-query.service";

interface NotifyImpersonatedUserDeps {
  IEmailService: IEmailService;
  AdminQueryService: AdminQueryService;
}

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

    await c.IEmailService.sendTemplate("impersonation_started", user.email, {
      userName: user.name,
      startedAt: new Date().toLocaleString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      expiresAt: new Date(parsed.data.expiresAt).toLocaleString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      reason: parsed.data.reason,
    }).catch(() => {});
  },
);

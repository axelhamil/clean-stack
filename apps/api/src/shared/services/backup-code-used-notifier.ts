import { type EventHandler, type IDomainEvent, onEvent, Result } from "@packages/ddd-kit";
import { EventTypes, UserMfaBackupCodeUsedPayload } from "@packages/events";
import { env } from "../env";
import { handlerIdempotency } from "../handler-idempotency";
import { localeForUser } from "../locale-for-user";
import { logger } from "../logger";
import type { IEmailService } from "../ports/email.port";
import type { IProfileStore } from "../ports/profile.port";

interface BackupCodeUsedNotifierDeps {
  IEmailService: IEmailService;
  IProfileStore: IProfileStore;
}

const HANDLER_NAME = "notify-backup-code-used";

export const backupCodeUsedNotifier: (deps: BackupCodeUsedNotifierDeps) => EventHandler = onEvent(
  EventTypes.USER_MFA_BACKUP_CODE_USED,
  HANDLER_NAME,
  (deps: BackupCodeUsedNotifierDeps) => async (event: IDomainEvent) => {
    const parsed = UserMfaBackupCodeUsedPayload.safeParse(event.payload);
    if (!parsed.success) {
      logger.warn({ eventType: event.eventType }, "backup-code-used notifier: invalid payload");
      return Result.ok();
    }

    const securityUrl = `${env.APP_URL}/settings/account`;
    const locale = await localeForUser(deps.IProfileStore, parsed.data.userId);
    return deps.IEmailService.sendTemplate(
      "backup_code_used",
      parsed.data.email,
      { securityUrl },
      { locale, ...handlerIdempotency(HANDLER_NAME, event) },
    );
  },
);

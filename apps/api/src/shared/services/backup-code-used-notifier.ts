import { type EventHandler, type IDomainEvent, onEvent } from "@packages/ddd-kit";
import { EventTypes, UserMfaBackupCodeUsedPayload } from "@packages/events";
import { env } from "../env";
import { localeForUser } from "../locale-for-user";
import { logger } from "../logger";
import type { IEmailService } from "../ports/email.port";
import type { IProfileStore } from "../ports/profile.port";

interface BackupCodeUsedNotifierDeps {
  IEmailService: IEmailService;
  IProfileStore: IProfileStore;
}

export const backupCodeUsedNotifier: (deps: BackupCodeUsedNotifierDeps) => EventHandler = onEvent(
  EventTypes.USER_MFA_BACKUP_CODE_USED,
  (deps: BackupCodeUsedNotifierDeps) => async (event: IDomainEvent) => {
    const parsed = UserMfaBackupCodeUsedPayload.safeParse(event.payload);
    if (!parsed.success) {
      logger.warn({ eventType: event.eventType }, "backup-code-used notifier: invalid payload");
      return;
    }
    const securityUrl = `${env.APP_URL ?? ""}/settings/account`;
    const locale = await localeForUser(deps.IProfileStore, parsed.data.userId);
    const sent = await deps.IEmailService.sendTemplate(
      "backup_code_used",
      parsed.data.email,
      { securityUrl },
      { locale },
    );
    if (sent.isFailure) {
      logger.warn(
        { err: sent.getError(), userId: parsed.data.userId },
        "backup-code-used notifier: email send failed",
      );
    }
  },
);

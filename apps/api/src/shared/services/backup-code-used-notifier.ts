import { type EventHandler, type IDomainEvent, onEvent } from "@packages/ddd-kit";
import { EventTypes, UserMfaBackupCodeUsedPayload } from "@packages/events";
import { DEFAULT_LOCALE, type Locale } from "@packages/i18n";
import type { IProfileStore } from "../../modules/profile/application/ports/profile.port";
import { env } from "../env";
import { logger } from "../logger";
import type { IEmailService } from "../ports/email.port";

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
    const stored = await deps.IProfileStore.findLocale(parsed.data.userId);
    const locale: Locale = stored.isSuccess
      ? (stored.getValue().toUndefined() ?? DEFAULT_LOCALE)
      : DEFAULT_LOCALE;
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

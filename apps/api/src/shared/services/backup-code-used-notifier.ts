import { type EventHandler, type IDomainEvent, onEvent } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { EventTypes, PayloadByEventType } from "@packages/events";
import { env } from "../env";
import { handlerIdempotency } from "../handler-idempotency";
import { localeForUser } from "../locale-for-user";
import { payloadParser } from "../payload-parser";
import type { IProfileStore } from "../ports/profile.port";

interface BackupCodeUsedNotifierDeps {
  IEmailService: IEmailService;
  IProfileStore: IProfileStore;
}

const HANDLER_NAME = "notify-backup-code-used";

const parsePayload = payloadParser(PayloadByEventType[EventTypes.USER_MFA_BACKUP_CODE_USED]);

export const backupCodeUsedNotifier: (deps: BackupCodeUsedNotifierDeps) => EventHandler = onEvent(
  EventTypes.USER_MFA_BACKUP_CODE_USED,
  HANDLER_NAME,
  (deps: BackupCodeUsedNotifierDeps) => async (event: IDomainEvent, payload) => {
    const securityUrl = `${env.APP_URL}/settings/account`;
    const locale = await localeForUser(deps.IProfileStore, payload.userId);
    return deps.IEmailService.sendTemplate(
      "backup_code_used",
      payload.email,
      { securityUrl },
      { locale, ...handlerIdempotency(HANDLER_NAME, event) },
    );
  },
  { payload: parsePayload },
);

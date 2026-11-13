import type { IGetLocaleQuery } from "@modules/profile/queries/get-locale";
import { type EventHandler, type IDomainEvent, onEvent } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { EventTypes, PayloadByEventType } from "@packages/events";
import { handlerIdempotency } from "@packages/outbox/handler-idempotency";
import { payloadParser } from "@packages/outbox/payload-parser";
import { env } from "../env";
import { localeForUser } from "../locale-for-user";

interface BackupCodeUsedNotifierDeps {
  IEmailService: IEmailService;
  IGetLocaleQuery: IGetLocaleQuery;
}

const HANDLER_NAME = "notify-backup-code-used";

const parsePayload = payloadParser(PayloadByEventType[EventTypes.USER_MFA_BACKUP_CODE_USED]);

export const backupCodeUsedNotifier: (deps: BackupCodeUsedNotifierDeps) => EventHandler = onEvent(
  EventTypes.USER_MFA_BACKUP_CODE_USED,
  HANDLER_NAME,
  (deps: BackupCodeUsedNotifierDeps) => async (event: IDomainEvent, payload) => {
    const securityUrl = `${env.APP_URL}/settings/account`;
    const locale = await localeForUser(deps.IGetLocaleQuery, payload.userId);
    return deps.IEmailService.sendTemplate(
      "backup_code_used",
      payload.email,
      { securityUrl },
      { locale, ...handlerIdempotency(HANDLER_NAME, event) },
    );
  },
  { payload: parsePayload },
);

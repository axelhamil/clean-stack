import { type IUseCase, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { handlerIdempotency } from "@packages/outbox/handler-idempotency";
import type { ILocaleReader } from "../../ports/services/locale-reader.port";
import type { IGetUserQuery } from "../../queries/get-user.query";
import type {
  NotifyImpersonatedUserError,
  NotifyImpersonatedUserInput,
} from "./notify-impersonated-user.dto";

export const NOTIFY_IMPERSONATED_USER = "notify-impersonated-user";

const FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export class NotifyImpersonatedUserUseCase
  implements IUseCase<NotifyImpersonatedUserInput, void, NotifyImpersonatedUserError>
{
  constructor(
    private readonly users: IGetUserQuery,
    private readonly emails: IEmailService,
    private readonly locales: ILocaleReader,
    private readonly supportUrl: string,
  ) {}

  async execute(
    input: NotifyImpersonatedUserInput,
  ): Promise<Result<void, NotifyImpersonatedUserError>> {
    const found = await this.users.execute({ userId: input.userId });
    if (found.isFailure) return Result.fail(found.getError());

    const target = found.getValue();
    if (target.isNone()) return Result.ok();

    const user = target.unwrap();
    const locale = await this.locales.localeOf(input.userId);

    return this.emails.sendTemplate(
      "impersonation_started",
      user.email,
      {
        userName: user.name,
        startedAt: input.event.dateOccurred.toLocaleString(locale, FORMAT),
        expiresAt: new Date(input.expiresAt).toLocaleString(locale, FORMAT),
        reason: input.reason,
        supportUrl: this.supportUrl,
      },
      { locale, ...handlerIdempotency(NOTIFY_IMPERSONATED_USER, input.event) },
    );
  }
}

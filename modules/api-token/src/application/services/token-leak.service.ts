import { type IInstrumentation, type IUnitOfWork, type Option, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { EventTypes } from "@packages/events";
import { toLocale } from "@packages/i18n";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { hmacToken, parseToken } from "../../domain/api-token-crypto";
import type { ApiTokenError, ApiTokenRecord, IApiTokenRepository } from "../ports/api-token.port";
import type { IUserContactReader } from "../ports/user-contact.port";

export type LeakReportEntry = { token: string; type: string };

export type LeakVerdict = {
  token_raw: string;
  token_type: string;
  label: "true_positive" | "false_positive";
};

type TokenLeakConfig = {
  prefix: string;
  pepper: string;
  pepperPrevious: Option<string>;
};

export class TokenLeakService {
  constructor(
    private readonly repo: IApiTokenRepository,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly email: IEmailService,
    private readonly users: IUserContactReader,
    private readonly instrumentation: IInstrumentation,
    private readonly config: TokenLeakConfig,
  ) {}

  async handleReport(entries: LeakReportEntry[]): Promise<Result<LeakVerdict[], ApiTokenError>> {
    return this.instrumentation.startSpan({ name: "TokenLeakService > handleReport" }, async () => {
      const verdicts = await Promise.all(entries.map((entry) => this.judge(entry)));

      return Result.combine(verdicts).map(() => verdicts.map((verdict) => verdict.getValue()));
    });
  }

  private async judge(entry: LeakReportEntry): Promise<Result<LeakVerdict, ApiTokenError>> {
    const verdict = (label: LeakVerdict["label"]) =>
      Result.ok<LeakVerdict, ApiTokenError>({
        token_raw: entry.token,
        token_type: entry.type,
        label,
      });

    if (parseToken(entry.token, this.config.prefix).isFailure) return verdict("false_positive");

    const found = await this.findByRawToken(entry.token);
    if (found.isFailure) return Result.fail(found.getError());

    const record = found.getValue();
    if (record.isNone()) return verdict("false_positive");

    const revoked = await this.revokeLeaked(record.unwrap());
    if (revoked.isFailure) return Result.fail(revoked.getError());

    return verdict("true_positive");
  }

  private async findByRawToken(
    raw: string,
  ): Promise<Result<Option<ApiTokenRecord>, ApiTokenError>> {
    const current = await this.repo.findByHmac(hmacToken(raw, this.config.pepper));
    if (current.isFailure || current.getValue().isSome()) return current;
    if (this.config.pepperPrevious.isNone()) return current;

    return this.repo.findByHmac(hmacToken(raw, this.config.pepperPrevious.unwrap()));
  }

  private async revokeLeaked(record: ApiTokenRecord): Promise<Result<void, ApiTokenError>> {
    if (record.revokedAt.isSome()) return Result.ok();

    const written = await this.revokeAndAnnounce(record);
    if (written.isFailure) return Result.fail(written.getError());
    if (written.getValue()) await this.warnOwner(record);

    return Result.ok();
  }

  private async revokeAndAnnounce(record: ApiTokenRecord): Promise<Result<boolean, ApiTokenError>> {
    try {
      return await this.uow.run(async () => {
        const revoked = await this.repo.revoke(record.id, "leaked");
        if (revoked.isFailure || !revoked.getValue()) return revoked;

        await emitEvent(
          this.outbox,
          EventTypes.API_TOKEN_REVOKED,
          "api_token",
          record.id,
          {
            userId: record.userId,
            actorUserId: null,
            organizationId: record.organizationId.toNull(),
            tokenId: record.id,
            reason: "leaked" as const,
          },
          { organizationId: record.organizationId.toNull() },
        );

        return revoked;
      });
    } catch (err) {
      this.instrumentation.capture(err);
      return Result.fail({
        code: "API_TOKEN_PROVIDER_FAILURE",
        message: "Failed to revoke the leaked API token.",
      });
    }
  }

  private async warnOwner(record: ApiTokenRecord): Promise<void> {
    const owner = await this.users.findContact(record.userId);
    if (owner.isFailure || owner.getValue().isNone()) return;

    const { email, name, locale } = owner.getValue().unwrap();
    const resolvedLocale = toLocale(locale.toNull());
    const sent = await this.email.sendTemplate(
      "api_token_leaked",
      email,
      {
        name: name.unwrapOr("User"),
        tokenName: record.name,
        revokedAt: new Date().toLocaleString(resolvedLocale),
      },
      { locale: resolvedLocale },
    );
    if (sent.isFailure) this.instrumentation.capture(sent.getError());
  }
}

import {
  type IInstrumentation,
  type IUnitOfWork,
  type IUseCase,
  type Option,
  Result,
} from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { toLocale } from "@packages/i18n";
import { ApiToken } from "../../../domain/api-token/api-token.aggregate";
import { ApiTokenId } from "../../../domain/api-token/api-token-id";
import { RawToken } from "../../../domain/api-token/value-objects/raw-token.vo";
import { TokenScopes } from "../../../domain/api-token/value-objects/token-scopes.vo";
import type { ApiTokenSettings } from "../../config/api-token-settings";
import type {
  ApiTokenError,
  ApiTokenRecord,
  IApiTokenRepository,
} from "../../ports/repositories/api-token.port";
import type { ITokenHasher } from "../../ports/services/token-hasher.port";
import type { IUserContactReader } from "../../ports/services/user-contact.port";
import type { HandleLeakReportInput, LeakReportEntry, LeakVerdict } from "./handle-leak-report.dto";

function restore({ id, scopes, ...props }: ApiTokenRecord): ApiToken {
  return ApiToken.reconstitute({ ...props, scopes: new TokenScopes(scopes) }, new ApiTokenId(id));
}

export class HandleLeakReportUseCase
  implements IUseCase<HandleLeakReportInput, LeakVerdict[], ApiTokenError>
{
  constructor(
    private readonly repo: IApiTokenRepository,
    private readonly hasher: ITokenHasher,
    private readonly uow: IUnitOfWork,
    private readonly email: IEmailService,
    private readonly users: IUserContactReader,
    private readonly instrumentation: IInstrumentation,
    private readonly settings: ApiTokenSettings,
  ) {}

  async execute(input: HandleLeakReportInput): Promise<Result<LeakVerdict[], ApiTokenError>> {
    const verdicts = await Promise.all(input.entries.map((entry) => this.judge(entry)));

    return Result.combine(verdicts).map(() => verdicts.map((verdict) => verdict.getValue()));
  }

  private async judge(entry: LeakReportEntry): Promise<Result<LeakVerdict, ApiTokenError>> {
    const verdict = (label: LeakVerdict["label"]) =>
      Result.ok<LeakVerdict, ApiTokenError>({
        token_raw: entry.token,
        token_type: entry.type,
        label,
      });

    const raw = RawToken.parse(this.settings.prefix, entry.token);
    if (raw.isFailure) return verdict("false_positive");

    const found = await this.findByRawToken(entry.token);
    if (found.isFailure) return Result.fail(found.getError());

    const record = found.getValue();
    if (record.isNone()) return verdict("false_positive");

    const revoked = await this.revokeLeaked(restore(record.unwrap()));
    if (revoked.isFailure) return Result.fail(revoked.getError());

    return verdict("true_positive");
  }

  private async findByRawToken(
    raw: string,
  ): Promise<Result<Option<ApiTokenRecord>, ApiTokenError>> {
    const current = await this.repo.findByHmac(this.hasher.hmac(raw, this.settings.pepper));
    if (current.isFailure || current.getValue().isSome()) return current;
    if (this.settings.pepperPrevious.isNone()) return current;

    return this.repo.findByHmac(this.hasher.hmac(raw, this.settings.pepperPrevious.unwrap()));
  }

  private async revokeLeaked(token: ApiToken): Promise<Result<void, ApiTokenError>> {
    const now = new Date();
    if (token.revoke("leaked", null, now).isFailure) return Result.ok();

    const written = await this.revokeAndAnnounce(token);
    if (written.isFailure) return Result.fail(written.getError());
    if (written.getValue()) await this.warnOwner(token, now);

    return Result.ok();
  }

  private async revokeAndAnnounce(token: ApiToken): Promise<Result<boolean, ApiTokenError>> {
    try {
      return await this.uow.run(() => this.repo.revoke(token));
    } catch (err) {
      this.instrumentation.capture(err);
      return Result.fail({
        code: "API_TOKEN_PROVIDER_FAILURE",
        message: "Failed to revoke the leaked API token.",
      });
    }
  }

  private async warnOwner(token: ApiToken, revokedAt: Date): Promise<void> {
    const owner = await this.users.findContact(token.get("userId"));
    if (owner.isFailure || owner.getValue().isNone()) return;

    const { email, name, locale } = owner.getValue().unwrap();
    const resolvedLocale = toLocale(locale.toNull());
    const sent = await this.email.sendTemplate(
      "api_token_leaked",
      email,
      {
        name: name.unwrapOr("User"),
        tokenName: token.get("name"),
        revokedAt: revokedAt.toLocaleString(resolvedLocale),
      },
      { locale: resolvedLocale },
    );
    if (sent.isFailure) this.instrumentation.capture(sent.getError());
  }
}

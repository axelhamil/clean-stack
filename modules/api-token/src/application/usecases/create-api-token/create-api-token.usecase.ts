import {
  type IInstrumentation,
  type IUnitOfWork,
  type IUseCase,
  Option,
  Result,
} from "@packages/ddd-kit";
import { ApiToken } from "../../../domain/api-token/api-token.aggregate";
import { RawToken } from "../../../domain/api-token/value-objects/raw-token.vo";
import { TokenScopes } from "../../../domain/api-token/value-objects/token-scopes.vo";
import type { ApiTokenSettings } from "../../config/api-token-settings";
import type { ApiTokenError, IApiTokenRepository } from "../../ports/repositories/api-token.port";
import type { ITokenHasher } from "../../ports/services/token-hasher.port";
import type { CreateApiTokenInput, CreateApiTokenOutput } from "./create-api-token.dto";

const CREATION_FAILED: ApiTokenError = {
  code: "API_TOKEN_PROVIDER_FAILURE",
  message: "Failed to create API token.",
};

export class CreateApiTokenUseCase
  implements IUseCase<CreateApiTokenInput, CreateApiTokenOutput, ApiTokenError>
{
  constructor(
    private readonly repo: IApiTokenRepository,
    private readonly hasher: ITokenHasher,
    private readonly uow: IUnitOfWork,
    private readonly instrumentation: IInstrumentation,
    private readonly settings: ApiTokenSettings,
  ) {}

  async execute(input: CreateApiTokenInput): Promise<Result<CreateApiTokenOutput, ApiTokenError>> {
    const scopes = TokenScopes.parse(input.scopes);
    if (scopes.isFailure) return Result.fail(scopes.getError());

    const raw = RawToken.issue(this.settings.prefix, this.hasher.randomBody());
    if (raw.isFailure) return Result.fail(CREATION_FAILED);

    const secret = raw.getValue();
    const created = ApiToken.create({
      userId: input.userId,
      actorUserId: input.actorUserId,
      organizationId: Option.fromNullable(input.organizationId),
      name: input.name,
      scopes: scopes.getValue(),
      secret: {
        hmac: this.hasher.hmac(secret.value.raw, this.settings.pepper),
        pepperVersion: this.settings.pepperVersion,
        start: secret.start(),
      },
      expiresInDays: Option.fromNullable(input.expiresInDays),
      maxExpiryDays: this.settings.maxExpiryDays,
      now: new Date(),
    });
    if (created.isFailure) return Result.fail(created.getError());

    const token = created.getValue();
    try {
      const saved = await this.uow.run(() => this.repo.insert(token));
      if (saved.isFailure) return Result.fail(saved.getError());

      return Result.ok({ token, raw: secret.value.raw });
    } catch (err) {
      this.instrumentation.capture(err);
      return Result.fail(CREATION_FAILED);
    }
  }
}

import { type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { generateToken, hmacToken } from "../../../../shared/crypto/api-token";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type { ITransaction } from "../../../../shared/transaction";
import type {
  ApiTokenError,
  ApiTokenRecord,
  IApiTokenRepository,
  TokenOwner,
} from "../ports/api-token.port";

export type CreateTokenServiceInput = {
  userId: string;
  actorUserId: string;
  name: string;
  scopes: string[];
  organizationId: string | null;
  expiresInDays: number | null;
};

type ApiTokenServiceConfig = {
  prefix: string;
  pepper: string;
  maxExpiryDays: number;
  pepperVersion: number;
};

export class ApiTokenService {
  constructor(
    private readonly repo: IApiTokenRepository,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork<ITransaction>,
    private readonly instrumentation: IInstrumentation,
    private readonly config: ApiTokenServiceConfig,
  ) {}

  async create(
    input: CreateTokenServiceInput,
  ): Promise<Result<{ record: ApiTokenRecord; raw: string }, ApiTokenError>> {
    return this.instrumentation.startSpan({ name: "ApiTokenService > create" }, async () => {
      if (input.expiresInDays != null && input.expiresInDays > this.config.maxExpiryDays) {
        return Result.fail<{ record: ApiTokenRecord; raw: string }, ApiTokenError>({
          code: "API_TOKEN_EXPIRY_TOO_LONG",
          message: `Expiry cannot exceed ${this.config.maxExpiryDays} days.`,
        });
      }

      const { raw, start } = generateToken(this.config.prefix);
      const expiresAt =
        input.expiresInDays != null
          ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
          : null;

      const record: ApiTokenRecord = {
        id: crypto.randomUUID(),
        userId: input.userId,
        organizationId: input.organizationId,
        name: input.name,
        scopes: input.scopes,
        tokenHmac: hmacToken(raw, this.config.pepper),
        pepperVersion: this.config.pepperVersion,
        tokenStart: start,
        lastUsedAt: null,
        expiresAt,
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
      };

      let failure: ApiTokenError | null = null;
      try {
        await this.uow.run(async (tx) => {
          const insertResult = await this.repo.insert(record, tx);
          if (insertResult.isFailure) {
            failure = insertResult.getError();
            throw new Error("rollback");
          }
          await emitEvent(
            this.outbox,
            EventTypes.API_TOKEN_CREATED,
            "api_token",
            record.id,
            {
              userId: record.userId,
              actorUserId: input.actorUserId,
              organizationId: record.organizationId,
              tokenId: record.id,
              name: record.name,
              scopes: record.scopes,
              expiresAt: record.expiresAt,
            },
            { organizationId: record.organizationId },
            tx,
          );
        });
        return Result.ok({ record, raw });
      } catch (err) {
        if (failure) return Result.fail(failure);
        this.instrumentation.capture(err);
        return Result.fail({
          code: "API_TOKEN_PROVIDER_FAILURE",
          message: "Failed to create API token.",
          metadata: { cause: err instanceof Error ? err.message : String(err) },
        });
      }
    });
  }

  async revoke(
    id: string,
    owner: TokenOwner,
    actorUserId: string,
  ): Promise<Result<void, ApiTokenError>> {
    return this.instrumentation.startSpan({ name: "ApiTokenService > revoke" }, async () => {
      const findResult = await this.repo.findByIdForOwner(id, owner);
      if (findResult.isFailure) return Result.fail(findResult.getError());

      const option = findResult.getValue();
      if (option.isNone()) {
        return Result.fail<void, ApiTokenError>({
          code: "API_TOKEN_NOT_FOUND",
          message: "Token not found.",
        });
      }
      const record = option.unwrap();

      let failure: ApiTokenError | null = null;
      try {
        await this.uow.run(async (tx) => {
          const revokeResult = await this.repo.revoke(id, "user", tx);
          if (revokeResult.isFailure) {
            failure = revokeResult.getError();
            throw new Error("rollback");
          }
          await emitEvent(
            this.outbox,
            EventTypes.API_TOKEN_REVOKED,
            "api_token",
            id,
            {
              userId: record.userId,
              actorUserId,
              organizationId: record.organizationId,
              tokenId: id,
              reason: "user" as const,
            },
            { organizationId: record.organizationId },
            tx,
          );
        });
        return Result.ok();
      } catch (err) {
        if (failure) return Result.fail(failure);
        this.instrumentation.capture(err);
        return Result.fail({
          code: "API_TOKEN_PROVIDER_FAILURE",
          message: "Failed to revoke API token.",
          metadata: { cause: err instanceof Error ? err.message : String(err) },
        });
      }
    });
  }

  async list(owner: TokenOwner): Promise<Result<ApiTokenRecord[], ApiTokenError>> {
    return this.instrumentation.startSpan({ name: "ApiTokenService > list" }, () =>
      this.repo.listByOwner(owner),
    );
  }
}

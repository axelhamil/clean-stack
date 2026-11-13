import { Aggregate, type AppError, Option, Result } from "@packages/ddd-kit";
import type { API_TOKEN_REVOKED_REASONS } from "@packages/events";
import { ApiTokenId } from "./api-token-id";
import { apiTokenCreatedEvent } from "./events/api-token-created.event";
import { apiTokenRevokedEvent } from "./events/api-token-revoked.event";
import type { TokenScopes } from "./value-objects/token-scopes.vo";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RevokedReason = (typeof API_TOKEN_REVOKED_REASONS)[number];

export type ApiTokenExpiryInvalid = AppError<"API_TOKEN_EXPIRY_INVALID">;

export type ApiTokenAlreadyRevoked = "API_TOKEN_ALREADY_REVOKED";

export interface ApiTokenProps {
  userId: string;
  organizationId: Option<string>;
  name: string;
  scopes: TokenScopes;
  tokenHmac: string;
  pepperVersion: number;
  tokenStart: string;
  lastUsedAt: Option<Date>;
  expiresAt: Option<Date>;
  revokedAt: Option<Date>;
  revokedReason: Option<RevokedReason>;
  createdAt: Date;
}

export interface TokenSecret {
  hmac: string;
  pepperVersion: number;
  start: string;
}

export interface NewApiToken {
  userId: string;
  actorUserId: string;
  organizationId: Option<string>;
  name: string;
  scopes: TokenScopes;
  secret: TokenSecret;
  expiresInDays: Option<number>;
  maxExpiryDays: number;
  now: Date;
}

export class ApiToken extends Aggregate<ApiTokenProps, ApiTokenId> {
  private constructor(props: ApiTokenProps, id: ApiTokenId) {
    super(props, id);
  }

  static create(input: NewApiToken): Result<ApiToken, ApiTokenExpiryInvalid> {
    if (input.expiresInDays.isSome() && input.expiresInDays.unwrap() > input.maxExpiryDays) {
      return Result.fail({
        code: "API_TOKEN_EXPIRY_INVALID",
        message: `Expiry cannot exceed ${input.maxExpiryDays} days.`,
      });
    }

    const expiresAt = input.expiresInDays.map(
      (days) => new Date(input.now.getTime() + days * DAY_MS),
    );

    const token = new ApiToken(
      {
        userId: input.userId,
        organizationId: input.organizationId,
        name: input.name,
        scopes: input.scopes,
        tokenHmac: input.secret.hmac,
        pepperVersion: input.secret.pepperVersion,
        tokenStart: input.secret.start,
        lastUsedAt: Option.none(),
        expiresAt,
        revokedAt: Option.none(),
        revokedReason: Option.none(),
        createdAt: input.now,
      },
      new ApiTokenId(),
    );
    token.addEvent(
      apiTokenCreatedEvent(
        {
          userId: input.userId,
          actorUserId: input.actorUserId,
          organizationId: input.organizationId.toNull(),
          tokenId: token.id.value,
          name: input.name,
          scopes: input.scopes.value,
          expiresAt: expiresAt.toNull(),
        },
        input.now,
      ),
    );

    return Result.ok(token);
  }

  static reconstitute(props: ApiTokenProps, id: ApiTokenId): ApiToken {
    return new ApiToken(props, id);
  }

  revoke(
    reason: RevokedReason,
    actorUserId: string | null,
    now: Date,
  ): Result<void, ApiTokenAlreadyRevoked> {
    if (this._props.revokedAt.isSome()) return Result.fail("API_TOKEN_ALREADY_REVOKED");

    this._props.revokedAt = Option.some(now);
    this._props.revokedReason = Option.some(reason);
    this.addEvent(
      apiTokenRevokedEvent(
        {
          userId: this._props.userId,
          actorUserId,
          organizationId: this._props.organizationId.toNull(),
          tokenId: this.id.value,
          reason,
        },
        now,
      ),
    );

    return Result.ok();
  }

  isUsable(now: Date): boolean {
    const expired = this._props.expiresAt.isSome() && this._props.expiresAt.unwrap() < now;

    return this._props.revokedAt.isNone() && !expired;
  }
}

import { EventCollector, type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { and, dbOperationFailure, eq, isNull, lt, or, resolveExecutor } from "@packages/drizzle";
import * as apiTokenSchema from "../../../../schemas/api-token";
import type {
  ApiTokenError,
  ApiTokenRecord,
  BulkRevocation,
  IApiTokenRepository,
  RevokedToken,
} from "../../../application/ports/repositories/api-token.port";
import type { ApiToken } from "../../../domain/api-token/api-token.aggregate";
import type { ApiTokenId } from "../../../domain/api-token/api-token-id";
import type { TokenOwner } from "../../../domain/api-token/services/token-visibility.service";
import { toApiToken, toApiTokenRecord, toApiTokenRow } from "./api-token.mapper";

const dbAttrs = { "db.system.name": "postgresql" } as const;
const t = apiTokenSchema.apiToken;

const storeFailure = dbOperationFailure("API_TOKEN_PROVIDER_FAILURE");

export function mappedOrFailure<T>(
  mapped: Result<T, string>,
  op: string,
  instrumentation: IInstrumentation,
): Result<T, ApiTokenError> {
  if (mapped.isSuccess) return Result.ok(mapped.getValue());

  instrumentation.capture(new Error(mapped.getError()));
  return Result.fail(storeFailure(op));
}

/**
 * The rows an owner may see and revoke. Always AND-joined on `userId`, so a
 * member never reaches another member's token; the organization leg widens to
 * "this organization OR no organization at all" so a token created with the
 * "Personal" scope stays reachable while an organization is active (which it
 * always is, every user owning a personal organization).
 *
 * Exported so the repository's other methods can compose it; the predicate
 * itself is proven against a real Postgres by
 * `scripts/check-api-token-visibility.ts` (`pnpm --filter @modules/api-token
 * check:api-token-visibility`), not by the unit suite: that suite mocks
 * `@packages/drizzle`'s `and`/`or`/`eq`/`isNull`, so it evaluates the mock,
 * never the actual WHERE clause.
 */
export function visibleTokensFilter(owner: TokenOwner) {
  return and(
    eq(t.userId, owner.userId),
    owner.kind === "personal"
      ? isNull(t.organizationId)
      : or(isNull(t.organizationId), eq(t.organizationId, owner.organizationId)),
  );
}

export class DrizzleApiTokenRepository implements IApiTokenRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async insert(token: ApiToken): Promise<Result<void, ApiTokenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > insert" },
      async () => {
        try {
          const query = exec.insert(t).values(toApiTokenRow(token));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          EventCollector.collectFrom(token);
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("insert"));
        }
      },
    );
  }

  async findByIdForOwner(
    id: ApiTokenId,
    owner: TokenOwner,
  ): Promise<Result<Option<ApiToken>, ApiTokenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > findByIdForOwner" },
      async () => {
        try {
          const query = exec
            .select()
            .from(t)
            .where(and(eq(t.id, id.value), visibleTokensFilter(owner)))
            .limit(1);
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (!row) return Result.ok(Option.none());

          return mappedOrFailure(toApiToken(row), "findByIdForOwner", this.instrumentation).map(
            Option.some,
          );
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("findByIdForOwner"));
        }
      },
    );
  }

  async findByHmac(hmac: string): Promise<Result<Option<ApiTokenRecord>, ApiTokenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > findByHmac" },
      async () => {
        try {
          const query = exec.select().from(t).where(eq(t.tokenHmac, hmac)).limit(1);
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (!row) return Result.ok(Option.none());

          return mappedOrFailure(toApiTokenRecord(row), "findByHmac", this.instrumentation).map(
            Option.some,
          );
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("findByHmac"));
        }
      },
    );
  }

  async revoke(token: ApiToken): Promise<Result<boolean, ApiTokenError>> {
    const revokedAt = token.get("revokedAt");
    if (revokedAt.isNone()) return Result.ok(false);

    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > revoke" },
      async () => {
        try {
          const query = exec
            .update(t)
            .set({
              revokedAt: revokedAt.unwrap(),
              revokedReason: token.get("revokedReason").toNull(),
            })
            .where(and(eq(t.id, token.id.value), isNull(t.revokedAt)))
            .returning({ id: t.id });
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (rows.length === 0) return Result.ok(false);

          EventCollector.collectFrom(token);
          return Result.ok(true);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("revoke"));
        }
      },
    );
  }

  async revokeAllOfUser({
    userId,
    organizationId,
    reason,
  }: BulkRevocation): Promise<Result<RevokedToken[], ApiTokenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > revokeAllOfUser" },
      async () => {
        try {
          const query = exec
            .update(t)
            .set({ revokedAt: new Date(), revokedReason: reason })
            .where(
              and(
                eq(t.userId, userId),
                organizationId.isSome() ? eq(t.organizationId, organizationId.unwrap()) : undefined,
                isNull(t.revokedAt),
              ),
            )
            .returning({ tokenId: t.id, organizationId: t.organizationId });
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(
            rows.map((row) => ({
              tokenId: row.tokenId,
              organizationId: Option.fromNullable(row.organizationId),
            })),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("revokeAllOfUser"));
        }
      },
    );
  }

  async touchLastUsed(id: string, bucketFloor: Date): Promise<Result<boolean, ApiTokenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > touchLastUsed" },
      async () => {
        try {
          const query = exec
            .update(t)
            .set({ lastUsedAt: new Date() })
            .where(and(eq(t.id, id), or(isNull(t.lastUsedAt), lt(t.lastUsedAt, bucketFloor))))
            .returning({ id: t.id });
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows.length > 0);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("touchLastUsed"));
        }
      },
    );
  }

  async rehash(
    id: string,
    hmac: string,
    pepperVersion: number,
  ): Promise<Result<void, ApiTokenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > rehash" },
      async () => {
        try {
          const query = exec.update(t).set({ tokenHmac: hmac, pepperVersion }).where(eq(t.id, id));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("rehash"));
        }
      },
    );
  }
}

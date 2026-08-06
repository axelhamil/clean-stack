import { Option, Result } from "@packages/ddd-kit";
import type { ApiTokenRevokedReason } from "@packages/drizzle";
import { and, apiTokenSchema, db, eq, isNull, lt, or } from "@packages/drizzle";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ITransaction } from "../../../../shared/transaction";
import type {
  ApiTokenError,
  ApiTokenRecord,
  IApiTokenRepository,
  TokenOwner,
} from "../../application/ports/api-token.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;
const t = apiTokenSchema.apiToken;

function storeFailure(err: unknown, op: string): ApiTokenError {
  return {
    code: "API_TOKEN_PROVIDER_FAILURE",
    message: `database operation failed: ${op}`,
    metadata: { cause: err instanceof Error ? err.message : String(err) },
  };
}

function ownerFilter(owner: TokenOwner) {
  return and(
    eq(t.userId, owner.userId),
    owner.organizationId === null
      ? isNull(t.organizationId)
      : eq(t.organizationId, owner.organizationId),
  );
}

export class DrizzleApiTokenRepository implements IApiTokenRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async insert(row: ApiTokenRecord, tx?: ITransaction): Promise<Result<void, ApiTokenError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > insert" },
      async () => {
        try {
          const query = invoker.insert(t).values({
            id: row.id,
            userId: row.userId,
            organizationId: row.organizationId,
            name: row.name,
            scopes: row.scopes,
            tokenHmac: row.tokenHmac,
            pepperVersion: row.pepperVersion,
            tokenStart: row.tokenStart,
            lastUsedAt: row.lastUsedAt,
            expiresAt: row.expiresAt,
            revokedAt: row.revokedAt,
            revokedReason: row.revokedReason,
            createdAt: row.createdAt,
          });
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "insert"));
        }
      },
    );
  }

  async listByOwner(owner: TokenOwner): Promise<Result<ApiTokenRecord[], ApiTokenError>> {
    const invoker = db;
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > listByOwner" },
      async () => {
        try {
          const query = invoker.select().from(t).where(ownerFilter(owner));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows as ApiTokenRecord[]);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "listByOwner"));
        }
      },
    );
  }

  async findByIdForOwner(
    id: string,
    owner: TokenOwner,
  ): Promise<Result<Option<ApiTokenRecord>, ApiTokenError>> {
    const invoker = db;
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > findByIdForOwner" },
      async () => {
        try {
          const query = invoker
            .select()
            .from(t)
            .where(and(eq(t.id, id), ownerFilter(owner)))
            .limit(1);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(Option.fromNullable(rows[0] as ApiTokenRecord | undefined));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "findByIdForOwner"));
        }
      },
    );
  }

  async findByHmac(hmac: string): Promise<Result<Option<ApiTokenRecord>, ApiTokenError>> {
    const invoker = db;
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > findByHmac" },
      async () => {
        try {
          const query = invoker.select().from(t).where(eq(t.tokenHmac, hmac)).limit(1);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(Option.fromNullable(rows[0] as ApiTokenRecord | undefined));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "findByHmac"));
        }
      },
    );
  }

  async revoke(
    id: string,
    reason: ApiTokenRevokedReason,
    tx?: ITransaction,
  ): Promise<Result<void, ApiTokenError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > revoke" },
      async () => {
        try {
          const query = invoker
            .update(t)
            .set({ revokedAt: new Date(), revokedReason: reason })
            .where(and(eq(t.id, id), isNull(t.revokedAt)));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "revoke"));
        }
      },
    );
  }

  async revokeAllForMembership(
    userId: string,
    organizationId: string,
    tx?: ITransaction,
  ): Promise<Result<string[], ApiTokenError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > revokeAllForMembership" },
      async () => {
        try {
          const query = invoker
            .update(t)
            .set({ revokedAt: new Date(), revokedReason: "membership_lost" })
            .where(
              and(eq(t.userId, userId), eq(t.organizationId, organizationId), isNull(t.revokedAt)),
            )
            .returning({ id: t.id });
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows.map((r) => r.id));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "revokeAllForMembership"));
        }
      },
    );
  }

  async touchLastUsed(id: string, bucketFloor: Date): Promise<Result<boolean, ApiTokenError>> {
    const invoker = db;
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > touchLastUsed" },
      async () => {
        try {
          const query = invoker
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
          return Result.fail(storeFailure(err, "touchLastUsed"));
        }
      },
    );
  }

  async rehash(
    id: string,
    hmac: string,
    pepperVersion: number,
  ): Promise<Result<void, ApiTokenError>> {
    const invoker = db;
    return this.instrumentation.startSpan(
      { name: "DrizzleApiTokenRepository > rehash" },
      async () => {
        try {
          const query = invoker
            .update(t)
            .set({ tokenHmac: hmac, pepperVersion })
            .where(eq(t.id, id));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "rehash"));
        }
      },
    );
  }
}

import { Result } from "@packages/ddd-kit";
import { and, consentSchema, db, desc, eq, gt, isNull } from "@packages/drizzle";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ITransaction } from "../../../../shared/transaction";
import type {
  ConsentError,
  ConsentRecordRow,
  IConsentStore,
} from "../../application/ports/consent.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

function storeFailure(err: unknown, op: string): ConsentError {
  return {
    code: "CONSENT_PROVIDER_FAILURE",
    message: `database operation failed: ${op}`,
    metadata: { cause: err instanceof Error ? err.message : String(err) },
  };
}

export class DrizzleConsentStore implements IConsentStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async insert(row: ConsentRecordRow, tx?: ITransaction): Promise<Result<void, ConsentError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan({ name: "DrizzleConsentStore > insert" }, async () => {
      try {
        const query = invoker.insert(consentSchema.consentRecord).values({
          id: row.id,
          subjectId: row.subjectId,
          userId: row.userId ?? null,
          categories: row.categories,
          policyVersion: row.policyVersion,
          grantedAt: row.grantedAt,
          withdrawnAt: row.withdrawnAt ?? null,
          expiresAt: row.expiresAt,
          ipAddress: row.ipAddress ?? null,
          userAgent: row.userAgent ?? null,
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
    });
  }

  async findActiveBySubject(
    subjectId: string,
    policyVersion: string,
    tx?: ITransaction,
  ): Promise<Result<ConsentRecordRow | null, ConsentError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleConsentStore > findActiveBySubject" },
      async () => {
        try {
          const now = new Date();
          const query = invoker
            .select()
            .from(consentSchema.consentRecord)
            .where(
              and(
                eq(consentSchema.consentRecord.subjectId, subjectId),
                eq(consentSchema.consentRecord.policyVersion, policyVersion),
                isNull(consentSchema.consentRecord.withdrawnAt),
                gt(consentSchema.consentRecord.expiresAt, now),
              ),
            )
            .orderBy(desc(consentSchema.consentRecord.grantedAt))
            .limit(1);

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          const r = rows[0];
          if (!r) return Result.ok(null);
          return Result.ok(this.toRow(r));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "findActiveBySubject"));
        }
      },
    );
  }

  async findActiveByUser(
    userId: string,
    policyVersion: string,
    tx?: ITransaction,
  ): Promise<Result<ConsentRecordRow | null, ConsentError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleConsentStore > findActiveByUser" },
      async () => {
        try {
          const now = new Date();
          const query = invoker
            .select()
            .from(consentSchema.consentRecord)
            .where(
              and(
                eq(consentSchema.consentRecord.userId, userId),
                eq(consentSchema.consentRecord.policyVersion, policyVersion),
                isNull(consentSchema.consentRecord.withdrawnAt),
                gt(consentSchema.consentRecord.expiresAt, now),
              ),
            )
            .orderBy(desc(consentSchema.consentRecord.grantedAt))
            .limit(1);

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          const r = rows[0];
          if (!r) return Result.ok(null);
          return Result.ok(this.toRow(r));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "findActiveByUser"));
        }
      },
    );
  }

  async linkSubjectToUser(
    subjectId: string,
    userId: string,
    tx?: ITransaction,
  ): Promise<Result<void, ConsentError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleConsentStore > linkSubjectToUser" },
      async () => {
        try {
          const query = invoker
            .update(consentSchema.consentRecord)
            .set({ userId })
            .where(
              and(
                eq(consentSchema.consentRecord.subjectId, subjectId),
                isNull(consentSchema.consentRecord.userId),
              ),
            );
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "linkSubjectToUser"));
        }
      },
    );
  }

  private toRow(r: typeof consentSchema.consentRecord.$inferSelect): ConsentRecordRow {
    return {
      id: r.id,
      subjectId: r.subjectId,
      userId: r.userId ?? undefined,
      categories: r.categories,
      policyVersion: r.policyVersion,
      grantedAt: r.grantedAt,
      withdrawnAt: r.withdrawnAt ?? undefined,
      expiresAt: r.expiresAt,
      ipAddress: r.ipAddress ?? undefined,
      userAgent: r.userAgent ?? undefined,
    };
  }
}

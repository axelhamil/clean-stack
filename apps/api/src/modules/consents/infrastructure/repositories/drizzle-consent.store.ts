import { Option, Result } from "@packages/ddd-kit";
import { and, consentSchema, db, desc, eq, gt, isNull, type SQL } from "@packages/drizzle";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ITransaction } from "../../../../shared/transaction";
import type {
  ConsentError,
  ConsentRecordRow,
  IConsentStore,
} from "../../application/ports/consent.port";

const cr = consentSchema.consentRecord;
const dbAttrs = { "db.system.name": "postgresql" } as const;

function storeFailure(err: unknown, op: string): ConsentError {
  return {
    code: "CONSENT_PROVIDER_FAILURE",
    message: `database operation failed: ${op}`,
    metadata: { cause: err instanceof Error ? err.message : String(err) },
  };
}

function toRow(r: typeof cr.$inferSelect): ConsentRecordRow {
  return {
    id: r.id,
    subjectId: r.subjectId,
    userId: Option.fromNullable(r.userId),
    categories: r.categories,
    policyVersion: r.policyVersion,
    grantedAt: r.grantedAt,
    withdrawnAt: Option.fromNullable(r.withdrawnAt),
    expiresAt: r.expiresAt,
    ipAddress: Option.fromNullable(r.ipAddress),
    userAgent: Option.fromNullable(r.userAgent),
  };
}

function latestActive(exec: ITransaction | typeof db, owner: SQL, policyVersion: string) {
  return exec
    .select()
    .from(cr)
    .where(
      and(
        owner,
        eq(cr.policyVersion, policyVersion),
        isNull(cr.withdrawnAt),
        gt(cr.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(cr.grantedAt))
    .limit(1);
}

export class DrizzleConsentStore implements IConsentStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async insert(row: ConsentRecordRow, tx?: ITransaction): Promise<Result<void, ConsentError>> {
    const exec = tx ?? db;

    return this.instrumentation.startSpan({ name: "DrizzleConsentStore > insert" }, async () => {
      try {
        const query = exec.insert(cr).values({
          id: row.id,
          subjectId: row.subjectId,
          userId: row.userId.toNull(),
          categories: row.categories,
          policyVersion: row.policyVersion,
          grantedAt: row.grantedAt,
          withdrawnAt: row.withdrawnAt.toNull(),
          expiresAt: row.expiresAt,
          ipAddress: row.ipAddress.toNull(),
          userAgent: row.userAgent.toNull(),
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
  ): Promise<Result<Option<ConsentRecordRow>, ConsentError>> {
    const exec = tx ?? db;

    return this.instrumentation.startSpan(
      { name: "DrizzleConsentStore > findActiveBySubject" },
      async () => {
        try {
          const query = latestActive(exec, eq(cr.subjectId, subjectId), policyVersion);

          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row).map(toRow));
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
  ): Promise<Result<Option<ConsentRecordRow>, ConsentError>> {
    const exec = tx ?? db;

    return this.instrumentation.startSpan(
      { name: "DrizzleConsentStore > findActiveByUser" },
      async () => {
        try {
          const query = latestActive(exec, eq(cr.userId, userId), policyVersion);

          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row).map(toRow));
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
  ): Promise<Result<string[], ConsentError>> {
    const exec = tx ?? db;

    return this.instrumentation.startSpan(
      { name: "DrizzleConsentStore > linkSubjectToUser" },
      async () => {
        try {
          const query = exec
            .update(cr)
            .set({ userId })
            .where(and(eq(cr.subjectId, subjectId), isNull(cr.userId)))
            .returning({ id: cr.id });

          const linked = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(linked.map((row) => row.id));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure(err, "linkSubjectToUser"));
        }
      },
    );
  }
}

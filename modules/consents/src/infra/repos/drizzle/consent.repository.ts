import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  dbOperationFailure,
  desc,
  eq,
  gt,
  isNull,
  resolveExecutor,
  type SQL,
} from "@packages/drizzle";
import * as consentSchema from "../../../../schemas/consent";
import type {
  ConsentError,
  ConsentRecord,
  IConsentRepository,
} from "../../../application/ports/repositories/consent.port";
import { toConsentRecord, toConsentRow } from "./consent.mapper";

const cr = consentSchema.consentRecord;
const dbAttrs = { "db.system.name": "postgresql" } as const;

const storeFailure = dbOperationFailure("CONSENT_PROVIDER_FAILURE");

function latestActive(exec: ReturnType<typeof resolveExecutor>, owner: SQL, policyVersion: string) {
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

export class DrizzleConsentRepository implements IConsentRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async insert(record: ConsentRecord): Promise<Result<void, ConsentError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleConsentRepository > insert" },
      async () => {
        try {
          const query = exec.insert(cr).values(toConsentRow(record));

          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("insert"));
        }
      },
    );
  }

  async findActiveBySubject(
    subjectId: string,
    policyVersion: string,
  ): Promise<Result<Option<ConsentRecord>, ConsentError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleConsentRepository > findActiveBySubject" },
      async () => {
        try {
          const query = latestActive(exec, eq(cr.subjectId, subjectId), policyVersion);

          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row).map(toConsentRecord));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("findActiveBySubject"));
        }
      },
    );
  }

  async findActiveByUser(
    userId: string,
    policyVersion: string,
  ): Promise<Result<Option<ConsentRecord>, ConsentError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleConsentRepository > findActiveByUser" },
      async () => {
        try {
          const query = latestActive(exec, eq(cr.userId, userId), policyVersion);

          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row).map(toConsentRecord));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("findActiveByUser"));
        }
      },
    );
  }

  async linkSubjectToUser(
    subjectId: string,
    userId: string,
  ): Promise<Result<string[], ConsentError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleConsentRepository > linkSubjectToUser" },
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
          return Result.fail(storeFailure("linkSubjectToUser"));
        }
      },
    );
  }
}

import {
  createDbFailure,
  type IInstrumentation,
  type ILogger,
  Option,
  Result,
} from "@packages/ddd-kit";
import { desc, isNotNull, lockForTransaction, resolveExecutor } from "@packages/drizzle";
import * as auditLogSchema from "../../../../schemas/audit-log";
import type {
  AuditError,
  AuditRecord,
  IAuditLogRepository,
} from "../../../application/ports/repositories/audit-log.port";
import { toAuditLogRow } from "./audit-log.mapper";

const dbAttrs = { "db.system.name": "postgresql" } as const;
const al = auditLogSchema.auditLog;
const CHAIN_LOCK_KEY = "audit_log_chain";

function driverCause(e: unknown): string {
  const cause = e instanceof Error && e.cause instanceof Error ? e.cause : e;
  return cause instanceof Error ? cause.message : String(cause);
}

export class DrizzleAuditLogRepository implements IAuditLogRepository {
  private readonly fail;

  constructor(
    private readonly instrumentation: IInstrumentation,
    logger: ILogger,
  ) {
    this.fail = createDbFailure("AUDIT_PERSISTENCE_PROVIDER_FAILURE", logger);
  }

  async lockChain(): Promise<Result<void, AuditError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleAuditLogRepository > lockChain" },
      async () => {
        try {
          await this.instrumentation.startSpan(
            { name: "select pg_advisory_xact_lock", op: "db.query", attributes: dbAttrs },
            () => lockForTransaction(CHAIN_LOCK_KEY),
          );
          return Result.ok();
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, `audit lockChain failed: ${driverCause(e)}`);
        }
      },
    );
  }

  async lastChainHash(): Promise<Result<Option<string>, AuditError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleAuditLogRepository > lastChainHash" },
      async () => {
        try {
          const query = exec
            .select({ hash: al.hash })
            .from(al)
            .where(isNotNull(al.hash))
            .orderBy(desc(al.sequence))
            .limit(1);
          const [last] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(Option.fromNullable(last?.hash));
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, `audit lastChainHash failed: ${driverCause(e)}`);
        }
      },
    );
  }

  async append(record: AuditRecord): Promise<Result<void, AuditError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleAuditLogRepository > append" },
      async () => {
        try {
          const query = exec
            .insert(al)
            .values(toAuditLogRow(record))
            .onConflictDoNothing({ target: al.id });
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, `audit append failed: ${driverCause(e)}`);
        }
      },
    );
  }
}

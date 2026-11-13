import {
  createDbFailure,
  type IInstrumentation,
  type ILogger,
  Option,
  Result,
} from "@packages/ddd-kit";
import { asc, isNotNull, resolveExecutor } from "@packages/drizzle";
import * as auditLogSchema from "../../../schemas/audit-log";
import { toAuditHashInput } from "../../application/mappers/audit-hash-input.mapper";
import type { AuditError } from "../../application/ports/repositories/audit-log.port";
import {
  GENESIS_HASH,
  type IAuditHasher,
} from "../../application/ports/services/audit-hasher.port";
import type {
  ChainVerification,
  IVerifyAuditChainQuery,
} from "../../application/queries/verify-audit-chain.query";
import { toAuditRecord } from "../repos/drizzle/audit-log.mapper";

const dbAttrs = { "db.system.name": "postgresql" } as const;
const al = auditLogSchema.auditLog;

type AuditLogRow = typeof al.$inferSelect;
type ChainedRow = AuditLogRow & { hash: string };

function isChained(row: AuditLogRow): row is ChainedRow {
  return row.hash !== null;
}

export class DrizzleVerifyAuditChainQuery implements IVerifyAuditChainQuery {
  private readonly fail;

  constructor(
    private readonly hasher: IAuditHasher,
    private readonly instrumentation: IInstrumentation,
    logger: ILogger,
  ) {
    this.fail = createDbFailure("AUDIT_PERSISTENCE_PROVIDER_FAILURE", logger);
  }

  async execute(): Promise<Result<ChainVerification, AuditError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleVerifyAuditChainQuery > execute" },
      async () => {
        try {
          const query = exec.select().from(al).where(isNotNull(al.hash)).orderBy(asc(al.sequence));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(this.walk(rows.filter(isChained)));
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "audit verifyChain failed");
        }
      },
    );
  }

  private walk(rows: ChainedRow[]): ChainVerification {
    let prev = GENESIS_HASH;
    for (const row of rows) {
      const record = toAuditRecord(row);
      const recomputed = this.hasher.hash(
        toAuditHashInput(record, record.prevHash.unwrapOr(GENESIS_HASH)),
      );
      if (row.prevHash !== prev || row.hash !== recomputed) {
        return {
          verified: false,
          rowCount: rows.length,
          brokenAtId: Option.some(row.id),
          brokenAtSequence: Option.some(row.sequence),
        };
      }
      prev = row.hash;
    }

    return {
      verified: true,
      rowCount: rows.length,
      brokenAtId: Option.none(),
      brokenAtSequence: Option.none(),
    };
  }
}

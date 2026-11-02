import { Option, Result, uuidv7 } from "@packages/ddd-kit";
import {
  and,
  asc,
  auditLogSchema,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  like,
  lte,
  resolveExecutor,
} from "@packages/drizzle";
import { createDbFailure } from "../db-failure";
import {
  afterTimeIdCursor,
  encodeTimeIdCursor,
  exactInstant,
  timeIdCursorSchema,
} from "../pagination/time-id-cursor";
import type {
  AuditEntry,
  AuditError,
  AuditFilters,
  AuditPage,
  AuditRecord,
  ChainVerification,
  IAuditPort,
} from "../ports/audit.port";
import type { IInstrumentation } from "../ports/instrumentation.port";
import { computeAuditHash, GENESIS_HASH } from "./audit-hash";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const fail = createDbFailure("AUDIT_PERSISTENCE_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;
const al = auditLogSchema.auditLog;

function toRecord(row: typeof al.$inferSelect): AuditRecord {
  return {
    id: row.id,
    actorId: Option.fromNullable(row.actorId),
    actorType: row.actorType,
    organizationId: Option.fromNullable(row.organizationId),
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata,
    requestId: row.requestId ?? undefined,
    retention: row.retention,
    occurredAt: row.occurredAt,
    prevHash: Option.fromNullable(row.prevHash),
    hash: Option.fromNullable(row.hash),
  };
}

export class DrizzleAuditRepository implements IAuditPort {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async record(entry: AuditEntry): Promise<Result<AuditRecord, AuditError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DrizzleAuditRepository > record" }, async () => {
      const id = uuidv7();
      const occurredAt = new Date();
      try {
        const query = exec.insert(al).values({
          id,
          actorId: entry.actorId.toNull(),
          actorType: entry.actorType,
          organizationId: entry.organizationId.toNull(),
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          metadata: entry.metadata,
          requestId: entry.requestId ?? null,
          retention: entry.retention,
          occurredAt,
        });
        await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );
        return Result.ok({
          id,
          occurredAt,
          prevHash: Option.none<string>(),
          hash: Option.none<string>(),
          ...entry,
        });
      } catch (e) {
        this.instrumentation.capture(e);
        return fail(e, "audit record failed");
      }
    });
  }

  async list(filters: AuditFilters): Promise<Result<AuditPage, AuditError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DrizzleAuditRepository > list" }, async () => {
      const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const conds = [];
      if (filters.actorId) conds.push(eq(al.actorId, filters.actorId));
      if (filters.organizationId !== undefined) {
        conds.push(
          filters.organizationId === null
            ? isNull(al.organizationId)
            : eq(al.organizationId, filters.organizationId),
        );
      }
      if (filters.targetType) conds.push(eq(al.targetType, filters.targetType));
      if (filters.targetId) conds.push(eq(al.targetId, filters.targetId));
      if (filters.actionPrefix) conds.push(like(al.action, `${filters.actionPrefix}%`));
      if (filters.occurredFrom) conds.push(gte(al.occurredAt, filters.occurredFrom));
      if (filters.occurredTo) conds.push(lte(al.occurredAt, filters.occurredTo));
      const cursor = timeIdCursorSchema.safeParse(filters.cursor);
      if (cursor.success) conds.push(afterTimeIdCursor(al.occurredAt, al.id, cursor.data));
      const where = conds.length > 0 ? and(...conds) : undefined;

      try {
        const query = exec
          .select({ row: al, cursorAt: exactInstant(al.occurredAt) })
          .from(al)
          .where(where)
          .orderBy(desc(al.occurredAt), desc(al.id))
          .limit(limit + 1);
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);
        const items = page.map(({ row }) => toRecord(row));
        const last = page.at(-1);
        const nextCursor =
          hasMore && last
            ? Option.some(encodeTimeIdCursor(last.cursorAt, last.row.id))
            : Option.none<string>();
        return Result.ok({ items, nextCursor });
      } catch (e) {
        this.instrumentation.capture(e);
        return fail(e, "audit list failed");
      }
    });
  }

  async verifyChain(): Promise<Result<ChainVerification, AuditError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleAuditRepository > verifyChain" },
      async () => {
        try {
          const query = exec.select().from(al).where(isNotNull(al.hash)).orderBy(asc(al.sequence));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          let prev = GENESIS_HASH;
          for (const r of rows) {
            const recomputed = computeAuditHash({
              id: r.id,
              action: r.action,
              actorId: r.actorId,
              actorType: r.actorType,
              organizationId: r.organizationId,
              targetType: r.targetType,
              targetId: r.targetId,
              metadata: r.metadata,
              occurredAt: r.occurredAt.toISOString(),
              requestId: r.requestId ?? null,
              retention: r.retention,
              prevHash: r.prevHash ?? GENESIS_HASH,
            });
            if (r.prevHash !== prev || r.hash !== recomputed) {
              return Result.ok({
                verified: false,
                rowCount: rows.length,
                brokenAtId: Option.some(r.id),
                brokenAtSequence: Option.some(r.sequence),
              });
            }
            prev = r.hash as string;
          }
          return Result.ok({
            verified: true,
            rowCount: rows.length,
            brokenAtId: Option.none<string>(),
            brokenAtSequence: Option.none<number>(),
          });
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "audit verifyChain failed");
        }
      },
    );
  }
}

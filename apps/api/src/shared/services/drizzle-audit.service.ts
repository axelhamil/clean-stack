import { Result, uuidv7 } from "@packages/ddd-kit";
import {
  and,
  asc,
  auditLogSchema,
  db,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  type Transaction,
} from "@packages/drizzle";
import { createDbFailure } from "../db-failure";
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

export class DrizzleAuditRepository implements IAuditPort {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async record(entry: AuditEntry, tx?: Transaction): Promise<Result<AuditRecord, AuditError>> {
    const exec = tx ?? db;
    return this.instrumentation.startSpan({ name: "DrizzleAuditRepository > record" }, async () => {
      const id = uuidv7();
      const occurredAt = new Date();
      try {
        const query = exec.insert(auditLogSchema.auditLog).values({
          id,
          actorId: entry.actorId,
          actorType: entry.actorType,
          organizationId: entry.organizationId,
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
          prevHash: null,
          hash: null,
          ...entry,
        });
      } catch (e) {
        this.instrumentation.capture(e);
        return fail(e, "audit record failed");
      }
    });
  }

  async list(filters: AuditFilters, tx?: Transaction): Promise<Result<AuditPage, AuditError>> {
    const exec = tx ?? db;
    return this.instrumentation.startSpan({ name: "DrizzleAuditRepository > list" }, async () => {
      const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const al = auditLogSchema.auditLog;
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
      if (filters.cursor) {
        const cursorDate = new Date(filters.cursor);
        if (!Number.isNaN(cursorDate.getTime())) conds.push(lt(al.occurredAt, cursorDate));
      }
      const where = conds.length > 0 ? and(...conds) : undefined;

      try {
        const query = exec
          .select()
          .from(al)
          .where(where)
          .orderBy(desc(al.occurredAt))
          .limit(limit + 1);
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        const hasMore = rows.length > limit;
        const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
          id: r.id,
          actorId: r.actorId,
          actorType: r.actorType,
          organizationId: r.organizationId,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          metadata: r.metadata,
          requestId: r.requestId ?? undefined,
          retention: r.retention,
          occurredAt: r.occurredAt,
          prevHash: r.prevHash,
          hash: r.hash,
        }));
        const nextCursor = hasMore ? (items.at(-1)?.occurredAt.toISOString() ?? null) : null;
        return Result.ok({ items, nextCursor });
      } catch (e) {
        this.instrumentation.capture(e);
        return fail(e, "audit list failed");
      }
    });
  }

  async verifyChain(tx?: Transaction): Promise<Result<ChainVerification, AuditError>> {
    const exec = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleAuditRepository > verifyChain" },
      async () => {
        try {
          const al = auditLogSchema.auditLog;
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
                brokenAtId: r.id,
                brokenAtSequence: r.sequence,
              });
            }
            prev = r.hash as string;
          }
          return Result.ok({
            verified: true,
            rowCount: rows.length,
            brokenAtId: null,
            brokenAtSequence: null,
          });
        } catch (e) {
          this.instrumentation.capture(e);
          return fail(e, "audit verifyChain failed");
        }
      },
    );
  }
}

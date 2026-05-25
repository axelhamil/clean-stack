import { uuidv7 } from "@packages/ddd-kit";
import {
  and,
  auditLogSchema,
  db,
  desc,
  eq,
  gte,
  isNull,
  like,
  lt,
  lte,
  type Transaction,
} from "@packages/drizzle";
import type {
  AuditEntry,
  AuditFilters,
  AuditPage,
  AuditRecord,
  IAuditPort,
} from "../ports/audit.port";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export class DrizzleAuditRepository implements IAuditPort {
  async record(entry: AuditEntry, tx?: Transaction): Promise<AuditRecord> {
    const exec = tx ?? db;
    const id = uuidv7();
    const occurredAt = new Date();
    await exec.insert(auditLogSchema.auditLog).values({
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
    return {
      id,
      occurredAt,
      prevHash: null,
      hash: null,
      ...entry,
    };
  }

  async list(filters: AuditFilters, tx?: Transaction): Promise<AuditPage> {
    const exec = tx ?? db;
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

    const rows = await exec
      .select()
      .from(al)
      .where(where)
      .orderBy(desc(al.occurredAt))
      .limit(limit + 1);

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
    return { items, nextCursor };
  }
}

import {
  createDbFailure,
  type IInstrumentation,
  type ILogger,
  Option,
  Result,
} from "@packages/ddd-kit";
import { and, desc, eq, gte, like, lte, resolveExecutor } from "@packages/drizzle";
import {
  afterTimeIdCursor,
  encodeTimeIdCursor,
  exactInstant,
  timeIdCursorSchema,
} from "@packages/http/time-id-cursor";
import * as auditLogSchema from "../../../schemas/audit-log";
import type { AuditError } from "../../application/ports/repositories/audit-log.port";
import type {
  AuditFilters,
  AuditPage,
  IListAuditEventsQuery,
} from "../../application/queries/list-audit-events.query";
import { toAuditRecord } from "../repos/drizzle/audit-log.mapper";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const dbAttrs = { "db.system.name": "postgresql" } as const;
const al = auditLogSchema.auditLog;

function whereOf(filters: AuditFilters) {
  const conds = [];
  if (filters.actorId) conds.push(eq(al.actorId, filters.actorId));
  if (filters.organizationId !== undefined) {
    conds.push(eq(al.organizationId, filters.organizationId));
  }
  if (filters.targetType) conds.push(eq(al.targetType, filters.targetType));
  if (filters.targetId) conds.push(eq(al.targetId, filters.targetId));
  if (filters.actionPrefix) conds.push(like(al.action, `${filters.actionPrefix}%`));
  if (filters.occurredFrom) conds.push(gte(al.occurredAt, filters.occurredFrom));
  if (filters.occurredTo) conds.push(lte(al.occurredAt, filters.occurredTo));
  const cursor = timeIdCursorSchema.safeParse(filters.cursor);
  if (cursor.success) conds.push(afterTimeIdCursor(al.occurredAt, al.id, cursor.data));

  return conds.length > 0 ? and(...conds) : undefined;
}

export class DrizzleListAuditEventsQuery implements IListAuditEventsQuery {
  private readonly fail;

  constructor(
    private readonly instrumentation: IInstrumentation,
    logger: ILogger,
  ) {
    this.fail = createDbFailure("AUDIT_PERSISTENCE_PROVIDER_FAILURE", logger);
  }

  async execute(filters: AuditFilters): Promise<Result<AuditPage, AuditError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleListAuditEventsQuery > execute" },
      async () => {
        const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

        try {
          const query = exec
            .select({ row: al, cursorAt: exactInstant(al.occurredAt) })
            .from(al)
            .where(whereOf(filters))
            .orderBy(desc(al.occurredAt), desc(al.id))
            .limit(limit + 1);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          const hasMore = rows.length > limit;
          const page = rows.slice(0, limit);
          const last = page.at(-1);
          const nextCursor =
            hasMore && last
              ? Option.some(encodeTimeIdCursor(last.cursorAt, last.row.id))
              : Option.none<string>();

          return Result.ok({ items: page.map(({ row }) => toAuditRecord(row)), nextCursor });
        } catch (e) {
          this.instrumentation.capture(e);
          return this.fail(e, "audit list failed");
        }
      },
    );
  }
}

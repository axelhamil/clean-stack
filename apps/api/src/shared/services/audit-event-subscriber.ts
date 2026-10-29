import type { IUnitOfWork } from "@packages/ddd-kit";

import type { AuditActorType } from "@packages/drizzle";
import { auditLogSchema, desc, isNotNull, resolveExecutor, sql } from "@packages/drizzle";
import { retentionFor } from "@packages/events";
import type { BuiltInEventHandler } from "../event-handlers";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { DeliveredEvent } from "../ports/outbox.port";
import { computeAuditHash, GENESIS_HASH } from "./audit-hash";
import { ACTOR_KEYS, readUserId } from "./event-actor";

const al = auditLogSchema.auditLog;
const dbAttrs = { "db.system.name": "postgresql" } as const;
const CHAIN_LOCK = sql`select pg_advisory_xact_lock(hashtext('audit_log_chain'))`;

function extractActor(event: DeliveredEvent): { id: string | null; type: AuditActorType } {
  const actorId = readUserId(event.payload, ACTOR_KEYS);
  if (actorId.isNone()) return { id: null, type: "system" };

  return { id: actorId.unwrap(), type: "user" };
}

export class AuditEventSubscriber implements BuiltInEventHandler {
  readonly name = "audit-log";

  constructor(
    private readonly uow: IUnitOfWork,
    private readonly instrumentation: IInstrumentation,
    private readonly tamperEvidence: boolean,
  ) {}

  async handle(event: DeliveredEvent): Promise<void> {
    return this.instrumentation.startSpan({ name: "AuditEventSubscriber > handle" }, async () => {
      try {
        const retention = retentionFor(event.eventType);
        if (retention === "none") return;

        const actor = extractActor(event);
        const entry = {
          id: `audit-${event.eventId}`,
          action: event.eventType,
          actorId: actor.id,
          actorType: actor.type,
          organizationId: event.organizationId ?? null,
          targetType: event.aggregateType,
          targetId: event.aggregateId,
          requestId: event.requestId ?? null,
          retention,
        };

        await this.uow.run(async () => {
          const exec = resolveExecutor();
          let prevHash: string | null = null;
          let hash: string | null = null;
          if (this.tamperEvidence) {
            await exec.execute(CHAIN_LOCK);
            const last = await exec
              .select({ hash: al.hash })
              .from(al)
              .where(isNotNull(al.hash))
              .orderBy(desc(al.sequence))
              .limit(1)
              .execute();
            prevHash = last[0]?.hash ?? GENESIS_HASH;
            hash = computeAuditHash({
              ...entry,
              metadata: event.payload,
              occurredAt: event.dateOccurred.toISOString(),
              prevHash,
            });
          }

          const query = exec
            .insert(al)
            .values({
              ...entry,
              metadata: event.payload,
              occurredAt: event.dateOccurred,
              prevHash,
              hash,
            })
            .onConflictDoNothing({ target: al.id });
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
        });
      } catch (err) {
        this.instrumentation.capture(err);
        throw err;
      }
    });
  }
}

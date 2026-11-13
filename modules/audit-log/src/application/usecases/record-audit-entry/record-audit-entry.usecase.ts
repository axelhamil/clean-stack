import { type IUnitOfWork, type IUseCase, Option, Result } from "@packages/ddd-kit";
import { retentionFor } from "@packages/events";
import { readActorId } from "@packages/outbox/event-actor";
import type { AuditLogSettings } from "../../config/audit-log-settings";
import { toAuditHashInput } from "../../mappers/audit-hash-input.mapper";
import type {
  AuditEntry,
  AuditError,
  AuditRecord,
  IAuditLogRepository,
} from "../../ports/repositories/audit-log.port";
import { GENESIS_HASH, type IAuditHasher } from "../../ports/services/audit-hasher.port";
import type { RecordAuditEntryInput } from "./record-audit-entry.dto";

export class RecordAuditEntryUseCase implements IUseCase<RecordAuditEntryInput, void, AuditError> {
  constructor(
    private readonly repo: IAuditLogRepository,
    private readonly hasher: IAuditHasher,
    private readonly uow: IUnitOfWork,
    private readonly settings: AuditLogSettings,
  ) {}

  async execute(input: RecordAuditEntryInput): Promise<Result<void, AuditError>> {
    const retention = retentionFor(input.eventType);
    if (retention === "none") return Result.ok();

    const actorId = readActorId(input.payload);
    const entry: AuditEntry = {
      id: `audit-${input.eventId}`,
      action: input.eventType,
      actorId,
      actorType: actorId.isSome() ? "user" : "system",
      organizationId: input.organizationId,
      targetType: input.aggregateType,
      targetId: input.aggregateId,
      metadata: input.payload,
      occurredAt: input.occurredAt,
      requestId: input.requestId,
      retention,
    };

    return this.uow.run(async (): Promise<Result<void, AuditError>> => {
      const record = await this.chained(entry);
      if (record.isFailure) return Result.fail(record.getError());

      return this.repo.append(record.getValue());
    });
  }

  private async chained(entry: AuditEntry): Promise<Result<AuditRecord, AuditError>> {
    if (!this.settings.tamperEvidence) {
      return Result.ok({ ...entry, prevHash: Option.none(), hash: Option.none() });
    }

    const locked = await this.repo.lockChain();
    if (locked.isFailure) return Result.fail(locked.getError());

    const last = await this.repo.lastChainHash();
    if (last.isFailure) return Result.fail(last.getError());

    const prevHash = last.getValue().unwrapOr(GENESIS_HASH);
    const hash = this.hasher.hash(toAuditHashInput(entry, prevHash));

    return Result.ok({ ...entry, prevHash: Option.some(prevHash), hash: Option.some(hash) });
  }
}

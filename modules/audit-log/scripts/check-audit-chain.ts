import { NoOpInstrumentation, Option, Result, uuidv7 } from "@packages/ddd-kit";
import {
  and,
  asc,
  db,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  resolveExecutor,
  TransactionService,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { checkRun, silentLogger } from "@packages/test/check-harness";
import { requireLocalDatabase } from "@packages/test/require-local-database";
import * as auditLogSchema from "../schemas/audit-log";
import { toAuditHashInput } from "../src/application/mappers/audit-hash-input.mapper";
import { GENESIS_HASH } from "../src/application/ports/services/audit-hasher.port";
import { RecordAuditEntryUseCase } from "../src/application/usecases/record-audit-entry/record-audit-entry.usecase";
import { AuditEventSubscriber } from "../src/infra/adapters/audit-event-subscriber.adapter";
import { sha256AuditHasher } from "../src/infra/adapters/sha256-audit-hasher.adapter";
import { DrizzleVerifyAuditChainQuery } from "../src/infra/queries/verify-audit-chain.query";
import { toAuditRecord } from "../src/infra/repos/drizzle/audit-log.mapper";
import { DrizzleAuditLogRepository } from "../src/infra/repos/drizzle/audit-log.repository";

requireLocalDatabase("check-audit-chain");

const PROBE = `check-audit-chain-${crypto.randomUUID()}`;
const CONCURRENT_EVENTS = 24;
const ROLLBACK = "check-audit-chain rolls its verification back";

const al = auditLogSchema.auditLog;
const instrumentation = new NoOpInstrumentation();
const logger = silentLogger();
const uow = new TransactionService(instrumentation);
const recordAuditEntry = new RecordAuditEntryUseCase(
  new DrizzleAuditLogRepository(instrumentation, logger),
  sha256AuditHasher,
  uow,
  { tamperEvidence: true },
);
const subscriber = new AuditEventSubscriber(recordAuditEntry, instrumentation);
const verifyChain = new DrizzleVerifyAuditChainQuery(sha256AuditHasher, instrumentation, logger);

function delivered(index: number) {
  return {
    eventId: uuidv7(),
    eventType: EventTypes.USER_PROFILE_UPDATED,
    aggregateId: PROBE,
    aggregateType: "user",
    organizationId: `${PROBE}-org`,
    requestId: `${PROBE}-request-${index}`,
    payload: { userId: PROBE, changes: { name: { from: "a", to: `b${index}` } }, z: 1, a: [2, 1] },
    dateOccurred: new Date(Date.now() - index),
  };
}

async function cleanup(): Promise<void> {
  await db.delete(al).where(eq(al.targetId, PROBE));
}

const { step, fail, run } = checkRun("check-audit-chain", cleanup);

async function predecessorHash(sequence: number): Promise<Option<string>> {
  const [previous] = await db
    .select({ hash: al.hash })
    .from(al)
    .where(and(isNotNull(al.hash), lt(al.sequence, sequence)))
    .orderBy(desc(al.sequence))
    .limit(1);

  return Option.fromNullable(previous?.hash);
}

async function probeRowCount(): Promise<number> {
  const rows = await db.select({ id: al.id }).from(al).where(eq(al.targetId, PROBE));

  return rows.length;
}

async function concurrentDistinctEvents(): Promise<void> {
  const events = Array.from({ length: CONCURRENT_EVENTS }, (_, index) => delivered(index));
  await Promise.all(events.map((event) => subscriber.handle(event)));

  const rows = await db.select().from(al).where(eq(al.targetId, PROBE)).orderBy(asc(al.sequence));
  await step(
    "every concurrent distinct event appends exactly one row",
    rows.length === CONCURRENT_EVENTS &&
      new Set(rows.map(({ id }) => id)).size === CONCURRENT_EVENTS,
    { rows: rows.length },
  );

  const links = rows.flatMap(({ prevHash }) =>
    prevHash === null || prevHash === GENESIS_HASH ? [] : [prevHash],
  );
  const linked =
    links.length === 0
      ? []
      : await db.select({ id: al.id }).from(al).where(inArray(al.prevHash, links));
  await step("no two rows link to the same predecessor", linked.length === links.length, {
    links: links.length,
    linked: linked.length,
  });

  for (const row of rows) {
    const record = toAuditRecord(row);
    const recomputed = sha256AuditHasher.hash(
      toAuditHashInput(record, record.prevHash.unwrapOr(GENESIS_HASH)),
    );
    const predecessor = await predecessorHash(row.sequence);
    if (row.hash !== recomputed) return fail("a stored row hashes back to itself", row.id);
    if (row.prevHash !== predecessor.unwrapOr(GENESIS_HASH)) {
      return fail("each row links to the chained row just before it", {
        id: row.id,
        prevHash: row.prevHash,
        predecessor: predecessor.toNull(),
      });
    }
  }
  await step("each stored row hashes back to itself and links to the row before it", true);

  const redelivered = rows[0];
  if (!redelivered) return fail("a first probe row exists");
  await subscriber.handle({
    ...delivered(0),
    eventId: redelivered.id.replace(/^audit-/, ""),
  });
  const after = await probeRowCount();
  await step("a redelivery of a recorded event appends nothing", after === CONCURRENT_EVENTS, {
    rows: after,
  });
}

async function verifyOverRealRows(): Promise<void> {
  const outcome = await uow.run(async (): Promise<Result<void, string>> => {
    await resolveExecutor().delete(al).where(isNotNull(al.hash));

    for (const index of [1, 2, 3]) {
      const recorded = await subscriber.handle(delivered(index)).then(
        () => Result.ok(),
        (err: unknown) => Result.fail(String(err)),
      );
      if (recorded.isFailure) return Result.fail(recorded.getError());
    }

    const intact = await verifyChain.execute();
    await step(
      "verifyChain accepts a chain of real rows written by the use case",
      intact.isSuccess && intact.getValue().verified && intact.getValue().rowCount === 3,
      intact.isSuccess ? { ...intact.getValue(), brokenAtId: null, brokenAtSequence: null } : {},
    );

    const chained = await resolveExecutor()
      .select({ id: al.id, sequence: al.sequence })
      .from(al)
      .where(isNotNull(al.hash))
      .orderBy(asc(al.sequence));
    const tampered = chained[1];
    if (!tampered) return Result.fail("three chained rows exist");
    await resolveExecutor()
      .update(al)
      .set({ metadata: { tampered: true } })
      .where(eq(al.id, tampered.id));

    const broken = await verifyChain.execute();
    await step(
      "verifyChain names the first tampered row and its sequence",
      broken.isSuccess &&
        !broken.getValue().verified &&
        broken.getValue().brokenAtId.toNull() === tampered.id &&
        broken.getValue().brokenAtSequence.toNull() === tampered.sequence,
      broken.isSuccess
        ? {
            brokenAtId: broken.getValue().brokenAtId.toNull(),
            expected: tampered.id,
          }
        : broken.getError(),
    );

    return Result.fail(ROLLBACK);
  });

  await step(
    "the verification transaction rolled back",
    outcome.isFailure && outcome.getError() === ROLLBACK,
    outcome.isFailure ? outcome.getError() : "committed",
  );
  const leftover = await probeRowCount();
  await step("the rolled back verification left no row behind", leftover === 0, { leftover });
}

run(async () => {
  await cleanup();
  await concurrentDistinctEvents();
  await cleanup();
  await verifyOverRealRows();
}, "the audit hash chain holds on a real database");

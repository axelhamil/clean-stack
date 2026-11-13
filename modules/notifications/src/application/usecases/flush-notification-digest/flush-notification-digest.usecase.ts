import {
  type IInstrumentation,
  type ILogger,
  type IUnitOfWork,
  type IUseCase,
  Result,
} from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { toLocale } from "@packages/i18n";
import { buildDigests, digestIdempotencyKey, type PendingRow } from "../../mappers/digest.mapper";
import type { INotificationDigestStore } from "../../ports/repositories/notification-digest.port";
import type {
  FlushNotificationDigestError,
  FlushNotificationDigestInput,
  FlushNotificationDigestOutput,
} from "./flush-notification-digest.dto";

export const FLUSH_NOTIFICATION_DIGEST_LOCK = "flush-notification-emails";

interface FlushOutcome {
  skipped: boolean;
  flushed: number;
  notifications: number;
}

type FlushResult = Result<FlushOutcome, FlushNotificationDigestError>;

export class FlushNotificationDigestUseCase
  implements
    IUseCase<
      FlushNotificationDigestInput,
      FlushNotificationDigestOutput,
      FlushNotificationDigestError
    >
{
  constructor(
    private readonly store: INotificationDigestStore,
    private readonly email: IEmailService,
    private readonly uow: IUnitOfWork,
    private readonly instrumentation: IInstrumentation,
    private readonly logger: ILogger,
  ) {}

  async execute(
    input: FlushNotificationDigestInput,
  ): Promise<Result<FlushNotificationDigestOutput, FlushNotificationDigestError>> {
    const now = new Date();

    if (input.dryRun) {
      const counted = await this.store.countDue(now);
      if (counted.isFailure) return Result.fail(counted.getError());

      const eligible = counted.getValue();
      this.logger.info({ eligible }, "flush-notification-emails dry-run");

      return Result.ok({ dryRun: true, eligible, flushed: 0, notifications: 0 });
    }

    const flushed = await this.instrumentation.startSpan(
      { name: `flush > ${FLUSH_NOTIFICATION_DIGEST_LOCK}`, op: "function" },
      () => this.uow.run(() => this.flush(now, input.batchSize)),
    );
    if (flushed.isFailure) return Result.fail(flushed.getError());

    const outcome = flushed.getValue();
    if (outcome.skipped) {
      this.logger.info({}, "flush-notification-emails skipped, a concurrent run holds the lock");

      return Result.ok({ dryRun: false, skipped: true, flushed: 0, notifications: 0 });
    }

    return Result.ok({
      dryRun: false,
      skipped: false,
      flushed: outcome.flushed,
      notifications: outcome.notifications,
    });
  }

  private async flush(now: Date, batchSize: number): Promise<FlushResult> {
    const locked = await this.store.beginFlush(FLUSH_NOTIFICATION_DIGEST_LOCK);
    if (locked.isFailure) return Result.fail(locked.getError());
    if (!locked.getValue()) return Result.ok({ skipped: true, flushed: 0, notifications: 0 });

    const claimed = await this.claimEveryDueRow(now, batchSize);
    if (claimed.isFailure) return Result.fail(claimed.getError());

    const rows = claimed.getValue();
    if (rows.length === 0) return Result.ok({ skipped: false, flushed: 0, notifications: 0 });

    return this.send(rows);
  }

  private async claimEveryDueRow(
    now: Date,
    batchSize: number,
  ): Promise<Result<PendingRow[], FlushNotificationDigestError>> {
    const rows: PendingRow[] = [];
    let dropped = 0;

    for (;;) {
      const claimed = await this.store.claimDue(now, batchSize);
      if (claimed.isFailure) return Result.fail(claimed.getError());

      const candidates = claimed.getValue();
      if (candidates.length === 0) break;

      const droppedIds = candidates.filter((r) => !r.emailStillWanted).map((r) => r.id);
      if (droppedIds.length > 0) {
        const cleared = await this.store.dropUnwanted(droppedIds);
        if (cleared.isFailure) return Result.fail(cleared.getError());
        dropped += droppedIds.length;
      }

      const allowed: PendingRow[] = candidates.filter((r) => r.emailStillWanted);
      if (allowed.length > 0) {
        const marked = await this.store.markSent(
          allowed.map((r) => r.id),
          now,
        );
        if (marked.isFailure) return Result.fail(marked.getError());
        rows.push(...allowed);
      }

      if (candidates.length < batchSize) break;
    }

    if (dropped > 0) {
      this.logger.info(
        { dropped },
        "flush-notification-emails dropped rows whose preference changed",
      );
    }

    return Result.ok(rows);
  }

  private async send(rows: PendingRow[]): Promise<FlushResult> {
    const digests = buildDigests(rows);

    const recipients = await Promise.all(
      digests.map(async (d) => ({
        to: d.email,
        variables: {
          category: d.category,
          itemCount: String(d.items.length),
          itemsSummary: d.items.map((i) => i.eventType).join(", "),
        },
        locale: toLocale(d.locale.toNull()),
        idempotencyKey: await digestIdempotencyKey(d.notificationIds),
      })),
    );
    const enqueued = await this.email.sendTemplateBatch("notification_digest", recipients);

    if (enqueued.isFailure) {
      this.logger.error({ err: enqueued.getError() }, "flush-notification-emails enqueue failed");
      return Result.fail(enqueued.getError());
    }

    this.logger.info(
      { flushed: digests.length, notifications: rows.length },
      "flush-notification-emails done",
    );

    return Result.ok({ skipped: false, flushed: digests.length, notifications: rows.length });
  }
}

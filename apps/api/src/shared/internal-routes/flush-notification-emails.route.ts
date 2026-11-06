// `/internal/flush-notification-emails`, gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import { type Option, Result } from "@packages/ddd-kit";
import { toLocale } from "@packages/i18n";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { PinoLogger } from "hono-pino";
import { z } from "zod";
import { di } from "../../container";
import type { EmailError } from "../ports/email.port";
import type { DueNotification, NotificationDigestError } from "../ports/notification-digest.port";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { type SweepBeat, withSweepHeartbeat } from "./sweep-heartbeat";
import { type SweepSpans, sweepSpans } from "./sweep-span";

type HonoEnv = { Variables: { logger: PinoLogger } };

const bodySchema = z
  .object({
    batchSize: z.number().int().min(1).max(5000).optional(),
    dryRun: z.boolean().optional(),
  })
  .default({});

export type PendingRow = Omit<DueNotification, "emailStillWanted">;

export type DigestGroup = {
  userId: string;
  email: string;
  category: string;
  locale: Option<string>;
  notificationIds: string[];
  items: { eventType: string; payload: unknown }[];
};

export function buildDigests(rows: PendingRow[]): DigestGroup[] {
  const map = new Map<string, DigestGroup>();
  for (const row of rows) {
    const key = `${row.userId}:${row.category}`;
    const group = map.get(key);
    if (group) {
      group.notificationIds.push(row.id);
      group.items.push({ eventType: row.eventType, payload: row.payload });
    } else {
      map.set(key, {
        userId: row.userId,
        email: row.email,
        category: row.category,
        locale: row.locale,
        notificationIds: [row.id],
        items: [{ eventType: row.eventType, payload: row.payload }],
      });
    }
  }
  return [...map.values()];
}

export async function digestIdempotencyKey(ids: string[]): Promise<string> {
  const raw = ids.slice().sort().join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const DEFAULT_BATCH_SIZE = 500;
const FLUSH_LABEL = "flush-notification-emails";

interface FlushRun {
  batchSize: number;
  dryRun: boolean;
  logger: PinoLogger;
  spans: SweepSpans;
}

interface FlushResponse {
  dryRun: boolean;
  skipped?: boolean;
  eligible?: number;
  flushed: number;
  notifications: number;
}

type FlushError = NotificationDigestError | EmailError;

interface FlushOutcome {
  skipped: boolean;
  flushed: number;
  notifications: number;
}

export function beatOfFlush(response: FlushResponse): SweepBeat | undefined {
  if (response.dryRun || response.skipped) return undefined;

  return { outcome: "ok", count: response.flushed };
}

export async function flushDueNotifications({
  batchSize,
  dryRun,
  logger,
  spans,
}: FlushRun): Promise<FlushResponse> {
  const now = new Date();

  if (dryRun) {
    const counted = await di.INotificationDigestStore.countDue(now);
    if (counted.isFailure) throw failedFlush(counted.getError());
    const eligible = counted.getValue();
    logger.info({ eligible }, "flush-notification-emails dry-run");
    return { dryRun: true, eligible, flushed: 0, notifications: 0 };
  }

  // Single-flight. `FOR UPDATE SKIP LOCKED` already rules out a double send,
  // but not two runs each claiming half of one user's due rows and each mailing
  // a digest for a window the user was promised one of. The lock is
  // transaction scoped: it lives exactly as long as the claims it protects and
  // cannot expire under a long run, which a time-boxed lease could.
  const flush = () =>
    di.ITransactionService.run(async (): Promise<Result<FlushOutcome, FlushError>> => {
      const store = di.INotificationDigestStore;
      const locked = await store.beginFlush(FLUSH_LABEL);
      if (locked.isFailure) return Result.fail(locked.getError());
      if (!locked.getValue()) return Result.ok({ skipped: true, flushed: 0, notifications: 0 });

      // `batchSize` bounds each round-trip to Postgres, not the run: the
      // lock already rules out a *concurrent* run splitting a window, but
      // capping a single run at one page reintroduced the same split
      // sequentially, a backlog bigger than `batchSize` used to flush as
      // two digests for one promised window. This pages through every row
      // due *right now*, in the same transaction, and sends one digest per
      // (user, category) for the whole set.
      //
      // Every row leaving a page is resolved before the next page is read
      // dropped rows get `emailPendingAt = null`, kept rows get
      // `emailSentAt = now` right here, not after the whole loop, so
      // neither can still match the `WHERE` below on the next iteration.
      // `FOR UPDATE SKIP LOCKED` does not re-skip locks held by this same
      // transaction: a row left unresolved between pages would come back
      // on the next one. Marking it immediately, inside the same
      // transaction as the eventual send, keeps atomicity (a failed send
      // rolls every page's marks back together) without an accumulator
      // that grows, and a bound query parameter list, with the size of
      // the backlog.
      const rows: PendingRow[] = [];
      let dropped = 0;

      for (;;) {
        const claimed = await store.claimDue(now, batchSize);
        if (claimed.isFailure) return Result.fail(claimed.getError());
        const candidates = claimed.getValue();

        if (candidates.length === 0) break;

        // A preference flipped after the notification was queued (email
        // turned off, or the category left the org) is honoured here, not
        // by rewriting the fan-out's decision. A dropped row is not
        // eligible forever: its `emailPendingAt` is cleared so it stops
        // matching the due-window filter on the next run, the
        // notification itself, and its in-app read state, are untouched.
        const droppedIds = candidates.filter((r) => !r.emailStillWanted).map((r) => r.id);
        if (droppedIds.length > 0) {
          const cleared = await store.dropUnwanted(droppedIds);
          if (cleared.isFailure) return Result.fail(cleared.getError());
          dropped += droppedIds.length;
        }

        const allowed: PendingRow[] = candidates.filter((r) => r.emailStillWanted);
        if (allowed.length > 0) {
          const marked = await store.markSent(
            allowed.map((r) => r.id),
            now,
          );
          if (marked.isFailure) return Result.fail(marked.getError());
          rows.push(...allowed);
        }

        if (candidates.length < batchSize) break;
      }

      if (dropped > 0) {
        logger.info({ dropped }, "flush-notification-emails dropped rows whose preference changed");
      }

      if (rows.length === 0) return Result.ok({ skipped: false, flushed: 0, notifications: 0 });

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
      const enqueued = await di.IEmailService.sendTemplateBatch("notification_digest", recipients);

      if (enqueued.isFailure) {
        logger.error({ err: enqueued.getError() }, "flush-notification-emails enqueue failed");
        return Result.fail(enqueued.getError());
      }

      const notificationIds = rows.map((r) => r.id);

      logger.info(
        { flushed: digests.length, notifications: notificationIds.length },
        "flush-notification-emails done",
      );
      return Result.ok({
        skipped: false,
        flushed: digests.length,
        notifications: notificationIds.length,
      });
    });

  // One outer span over the whole paged transaction: its statements are many and
  // alike, and per-statement spans would be noise (rule #8, multi-query methods).
  const flushed = await spans.span({ name: `flush > ${FLUSH_LABEL}`, op: "function" }, flush);
  if (flushed.isFailure) throw failedFlush(flushed.getError());
  const outcome = flushed.getValue();

  if (outcome.skipped) {
    logger.info("flush-notification-emails skipped, a concurrent run holds the lock");
    return { dryRun: false, skipped: true, flushed: 0, notifications: 0 };
  }

  return {
    dryRun: false,
    skipped: false,
    flushed: outcome.flushed,
    notifications: outcome.notifications,
  };
}

function failedFlush(error: FlushError): HTTPException {
  return new HTTPException(502, { message: `${error.code}: ${error.message}` });
}

export const flushNotificationEmailsRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/flush-notification-emails", zV("json", bodySchema), async (c) => {
    const { batchSize = DEFAULT_BATCH_SIZE, dryRun = false } = c.req.valid("json");
    const spans = sweepSpans(di.IInstrumentation);
    const response = await withSweepHeartbeat(
      { label: FLUSH_LABEL, store: di.ISweepRunStore, spans, beatOf: beatOfFlush, dryRun },
      () => flushDueNotifications({ batchSize, dryRun, logger: c.var.logger, spans }),
    );

    return c.json(response);
  });

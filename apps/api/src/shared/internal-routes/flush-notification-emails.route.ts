// `/internal/flush-notification-emails` — gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import {
  alias,
  and,
  authSchema,
  count,
  db,
  eq,
  inArray,
  isNull,
  lte,
  notificationSchema,
  sql,
} from "@packages/drizzle";
import { NOTIFICATION_MAP } from "@packages/events";
import { toLocale } from "@packages/i18n";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { z } from "zod";
import { di } from "../../container";
import { zV } from "../validator";
import { internalLayers } from "./internal-layers";
import { sweepLockFor } from "./sweep-lock";
import { sweepSpans } from "./sweep-span";

type HonoEnv = { Variables: { logger: PinoLogger } };

const bodySchema = z
  .object({
    batchSize: z.number().int().min(1).max(5000).optional(),
    dryRun: z.boolean().optional(),
  })
  .default({});

export type PendingRow = {
  id: string;
  userId: string;
  category: string;
  eventType: string;
  email: string;
  locale: string | null;
  payload: unknown;
};

export type DigestGroup = {
  userId: string;
  email: string;
  category: string;
  locale: string | null;
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

// Forced notifications (security, payment failures, …) join no preference row
// at the fan-out either — the flush must honour the exact same exemption, or a
// user who disabled email for `security` would silently start losing forced
// digests it was never allowed to defer in the first place.
const FORCED_EVENT_TYPES = Object.entries(NOTIFICATION_MAP)
  .filter(([, config]) => config?.forced === true)
  .map(([eventType]) => eventType);

const p = notificationSchema.notificationPreference;
const upMail = alias(p, "up_mail");
const opMail = alias(p, "op_mail");

/**
 * Same precedence the fan-out resolves at insertion (`notification-fanout-
 * subscriber.ts`): org-locked wins, then the user's own choice, then the
 * org's unlocked default, then `TRUE`. Re-evaluated here, at send time,
 * against the *current* row — a preference flipped after the notification
 * was queued must be able to cancel a digest already scheduled.
 */
const forcedCheck =
  FORCED_EVENT_TYPES.length > 0
    ? sql`${notificationSchema.notification.eventType} IN (${sql.join(
        FORCED_EVENT_TYPES.map((t) => sql`${t}`),
        sql`, `,
      )})`
    : sql`FALSE`;

const emailStillWanted = sql<boolean>`(
  ${forcedCheck}
  OR COALESCE(
    CASE WHEN ${opMail.locked} THEN ${opMail.enabled} END,
    ${upMail.enabled},
    ${opMail.enabled},
    TRUE
  )
)`;

export const flushNotificationEmailsRoutes = new Hono<HonoEnv>()
  .use("*", ...internalLayers)
  .post("/flush-notification-emails", zV("json", bodySchema), async (c) => {
    const { batchSize = DEFAULT_BATCH_SIZE, dryRun = false } = c.req.valid("json");
    const now = new Date();
    const logger = c.var.logger;
    const n = notificationSchema.notification;
    const u = authSchema.user;

    if (dryRun) {
      const rows = await db
        .select({ eligible: count() })
        .from(n)
        .where(and(lte(n.emailPendingAt, now), isNull(n.emailSentAt)));
      const eligible = rows[0]?.eligible ?? 0;
      logger.info({ eligible }, "flush-notification-emails dry-run");
      return c.json({ dryRun: true, eligible, flushed: 0, notifications: 0 });
    }

    // Single-flight, same lease table the retention sweeps use.
    //
    // `FOR UPDATE SKIP LOCKED` below already makes a double *send* impossible —
    // two runs can never claim the same row. What it does not prevent is two
    // runs each claiming *half* of one user's due notifications and each mailing
    // a digest: no duplicate, but two e-mails for a window the user was promised
    // one of. Now that the window is a promise the selector makes, that split is
    // the failure mode worth a lease.
    const lock = sweepLockFor("flush-notification-emails", sweepSpans(di.IInstrumentation));
    if (!(await lock.acquire())) {
      logger.info("flush-notification-emails skipped — lease held by a concurrent run");
      return c.json({ dryRun: false, skipped: true, flushed: 0, notifications: 0 });
    }

    try {
      const { flushed, notifications } = await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);
        await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
        await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);

        // `batchSize` bounds each round-trip to Postgres, not the run: the
        // lease already rules out a *concurrent* run splitting a window, but
        // capping a single run at one page reintroduced the same split
        // sequentially — a backlog bigger than `batchSize` used to flush as
        // two digests for one promised window. This pages through every row
        // due *right now*, in the same transaction, and sends one digest per
        // (user, category) for the whole set.
        //
        // Every row leaving a page is resolved before the next page is read
        // — dropped rows get `emailPendingAt = null`, kept rows get
        // `emailSentAt = now` right here, not after the whole loop — so
        // neither can still match the `WHERE` below on the next iteration.
        // `FOR UPDATE SKIP LOCKED` does not re-skip locks held by this same
        // transaction: a row left unresolved between pages would come back
        // on the next one. Marking it immediately, inside the same
        // transaction as the eventual send, keeps atomicity (a failed send
        // rolls every page's marks back together) without an accumulator
        // that grows — and a bound query parameter list — with the size of
        // the backlog.
        const rows: PendingRow[] = [];
        let dropped = 0;

        for (;;) {
          const candidates = await tx
            .select({
              id: n.id,
              userId: n.userId,
              category: n.category,
              eventType: n.eventType,
              email: u.email,
              locale: u.locale,
              payload: n.payload,
              emailStillWanted,
            })
            .from(n)
            .innerJoin(u, eq(n.userId, u.id))
            .leftJoin(
              upMail,
              and(
                eq(upMail.scope, "user"),
                eq(upMail.channel, "email"),
                eq(upMail.category, n.category),
                eq(upMail.scopeId, n.userId),
              ),
            )
            .leftJoin(
              opMail,
              and(
                eq(opMail.scope, "org"),
                eq(opMail.channel, "email"),
                eq(opMail.category, n.category),
                eq(opMail.scopeId, n.organizationId),
              ),
            )
            .where(and(lte(n.emailPendingAt, now), isNull(n.emailSentAt)))
            .limit(batchSize)
            .for("update", { of: n, skipLocked: true });

          if (candidates.length === 0) break;

          // A preference flipped after the notification was queued (email
          // turned off, or the category left the org) is honoured here, not
          // by rewriting the fan-out's decision. A dropped row is not
          // eligible forever: its `emailPendingAt` is cleared so it stops
          // matching the due-window filter on the next run — the
          // notification itself, and its in-app read state, are untouched.
          const droppedIds = candidates.filter((r) => !r.emailStillWanted).map((r) => r.id);
          if (droppedIds.length > 0) {
            await tx.update(n).set({ emailPendingAt: null }).where(inArray(n.id, droppedIds));
            dropped += droppedIds.length;
          }

          const allowed = candidates.filter((r) => r.emailStillWanted) as PendingRow[];
          if (allowed.length > 0) {
            await tx
              .update(n)
              .set({ emailSentAt: now })
              .where(
                inArray(
                  n.id,
                  allowed.map((r) => r.id),
                ),
              );
            rows.push(...allowed);
          }

          if (candidates.length < batchSize) break;
        }

        if (dropped > 0) {
          logger.info(
            { dropped },
            "flush-notification-emails dropped rows whose preference changed",
          );
        }

        if (rows.length === 0) return { flushed: 0, notifications: 0 };

        const digests = buildDigests(rows);

        const enqueued = await di.IEmailService.sendTemplateBatch(
          "notification_digest",
          await Promise.all(
            digests.map(async (d) => ({
              to: d.email,
              variables: {
                category: d.category,
                itemCount: String(d.items.length),
                itemsSummary: d.items.map((i) => i.eventType).join(", "),
              },
              locale: toLocale(d.locale),
              idempotencyKey: await digestIdempotencyKey(d.notificationIds),
            })),
          ),
          { tx: tx as unknown as import("../transaction").ITransaction },
        );

        if (enqueued.isFailure) {
          logger.error({ err: enqueued.getError() }, "flush-notification-emails enqueue failed");
          throw new Error(enqueued.getError().message);
        }

        const notificationIds = rows.map((r) => r.id);

        logger.info(
          { flushed: digests.length, notifications: notificationIds.length },
          "flush-notification-emails done",
        );
        return { flushed: digests.length, notifications: notificationIds.length };
      });

      return c.json({ dryRun: false, skipped: false, flushed, notifications });
    } finally {
      await lock.release();
    }
  });

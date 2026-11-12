import { beforeEach, describe, expect, it, mock } from "bun:test";
import { type IUnitOfWork, NoOpInstrumentation } from "@packages/ddd-kit";
import { outboxSchema, sql } from "@packages/drizzle";
import {
  buildSignatureHeader,
  canonicalize,
  SIGNATURE_HEADER,
  sign,
} from "@packages/http/internal-signature";
import type { ISweepRunStore } from "@packages/http/sweep-run.port";
import type { SweepBatchErrorDecision } from "@packages/http/sweep-runner";
import { mockPort } from "@packages/test/bun";
import { Hono } from "hono";
import { type PinoLogger, pinoLogger } from "hono-pino";
import { pino } from "pino";
import { env } from "../../env";

const restrictViolation = new Error('Failed query: delete from "outbox_event"', {
  cause: Object.assign(
    new Error(
      'update or delete on table "outbox_event" violates RESTRICT setting of foreign key constraint',
    ),
    { code: "23001" },
  ),
});

let batchError: Error = restrictViolation;

const realPurge = await import("@packages/drizzle/sweep-purge");

mock.module("@packages/drizzle/sweep-purge", () => ({
  ...realPurge,
  purgeBatchWithTimeout: async () => {
    throw batchError;
  },
}));

mock.module("../../../container", () => ({
  di: {
    IInstrumentation: new NoOpInstrumentation(),
    ISweepRunStore: mockPort<ISweepRunStore>(),
    ITransactionService: mockPort<IUnitOfWork>(),
  },
}));

mock.module("../sweep-lock", () => ({
  sweepLockFor: () => ({ acquire: async () => true, release: async () => {} }),
}));

const { tableSweepRoute } = await import("../sweep-route");
const { sweepOutboxRoutes } = await import("../sweep-outbox.route");

const PATH = "/internal/sweep-test";

async function signedInit(path = PATH): Promise<RequestInit> {
  const rawBody = JSON.stringify({});
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sign(
    canonicalize({
      timestamp,
      method: "POST",
      path,
      host: "localhost",
      contentType: "application/json",
      rawBody,
    }),
    env.INTERNAL_SIGNING_KEY ?? "",
  );

  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost",
      [SIGNATURE_HEADER]: buildSignatureHeader(timestamp, signature),
    },
    body: rawBody,
  };
}

describe("tableSweepRoute", () => {
  beforeEach(() => {
    batchError = restrictViolation;
  });

  it("hands a failed batch and the request logger to onBatchError, and stops the sweep on break", async () => {
    const event = outboxSchema.outboxEvent;
    const onBatchError = mock((): SweepBatchErrorDecision => "break");
    const loggers: PinoLogger[] = [];

    const app = new Hono<{ Variables: { logger: PinoLogger } }>();
    app.use("*", pinoLogger({ pino: pino({ level: "silent" }) }));
    app.use("*", async (c, next) => {
      loggers.push(c.var.logger);
      await next();
    });
    app.route(
      "/internal",
      tableSweepRoute({
        label: "sweep-test",
        retentionDays: 30,
        table: event,
        idColumn: event.id,
        orderBy: event.dispatchedAt,
        filterFor: () => sql`true`,
        onBatchError,
      }),
    );

    const res = await app.request(PATH, await signedInit());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: 0, stopReasons: { default: "batch-error" } });
    expect(onBatchError).toHaveBeenCalledWith(restrictViolation, loggers[0]);
  });

  it("stops the outbox sweep instead of failing when a webhook delivery still references an aged event", async () => {
    const res = await requestOutboxSweep();

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: 0, stopReasons: { default: "batch-error" } });
  });

  it("fails the outbox sweep on an error whose cause chain loops back on itself", async () => {
    const looping = new Error("first");
    looping.cause = new Error("second", { cause: looping });
    batchError = looping;

    const res = await requestOutboxSweep();

    expect(res.status).toBe(500);
  }, 1_000);
});

async function requestOutboxSweep(): Promise<Response> {
  const app = new Hono();
  app.use("*", pinoLogger({ pino: pino({ level: "silent" }) }));
  app.onError((_err, c) => c.text("failed", 500));
  app.route("/internal", sweepOutboxRoutes);

  return app.request("/internal/sweep-outbox", await signedInit("/internal/sweep-outbox"));
}

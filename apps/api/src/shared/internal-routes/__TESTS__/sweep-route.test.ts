import { describe, expect, it, mock } from "bun:test";
import type { IUnitOfWork } from "@packages/ddd-kit";
import { outboxSchema, sql } from "@packages/drizzle";
import type { ISweepRunStore } from "@packages/http/sweep-run.port";
import type { SweepBatchErrorDecision } from "@packages/http/sweep-runner";
import { mockPort } from "@packages/test/bun";
import { Hono } from "hono";
import { type PinoLogger, pinoLogger } from "hono-pino";
import { pino } from "pino";
import { env } from "../../env";
import { NoOpInstrumentation } from "../../services/noop-instrumentation";
import { buildSignatureHeader, canonicalize, SIGNATURE_HEADER, sign } from "../internal-signature";

const foreignKeyViolation = Object.assign(new Error("violates foreign key constraint"), {
  code: "23503",
});

const realPurge = await import("@packages/drizzle/sweep-purge");

mock.module("@packages/drizzle/sweep-purge", () => ({
  ...realPurge,
  purgeBatchWithTimeout: async () => {
    throw foreignKeyViolation;
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

const PATH = "/internal/sweep-test";

async function signedInit(): Promise<RequestInit> {
  const rawBody = JSON.stringify({});
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sign(
    canonicalize({
      timestamp,
      method: "POST",
      path: PATH,
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
    expect(onBatchError).toHaveBeenCalledWith(foreignKeyViolation, loggers[0]);
  });
});

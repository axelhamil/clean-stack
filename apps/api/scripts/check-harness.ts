/**
 * The pieces every `check-*.ts` script used to redeclare: a pass/fail recorder and a
 * fail-fast step runner, a span recorder, probe claims on a shared queue, a process
 * clock set ahead, the seeded account lookup, and a signed request to an `/internal/*`
 * route mounted on a throwaway app. One copy, so a fix to how a check reports or signs
 * lands everywhere.
 */

import { Writable } from "node:stream";
import type { Result } from "@packages/ddd-kit";
import { authSchema, db, eq } from "@packages/drizzle";
import { symmetricEncrypt } from "better-auth/crypto";
import { Hono } from "hono";
import { pinoLogger } from "hono-pino";
import { pino } from "pino";
import { authSecretKey } from "../src/shared/auth/auth-secrets";
import { env } from "../src/shared/env";
import {
  buildSignatureHeader,
  canonicalize,
  SIGNATURE_HEADER,
  sign,
} from "../src/shared/internal-routes/internal-signature";
import type { IInstrumentation } from "../src/shared/ports/instrumentation.port";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import { seedEmail } from "./seed-account";

export async function seedTwoFactor(
  userId: string,
  secret: string,
  verified: boolean,
): Promise<void> {
  await db.insert(authSchema.twoFactor).values({
    id: `${userId}-two-factor`,
    userId,
    secret: await symmetricEncrypt({ key: authSecretKey(env), data: secret }),
    backupCodes: "[]",
    verified,
  });
}

export interface CheckRecorder {
  check(label: string, ok: boolean, extra?: unknown): void;
  readonly failures: number;
}

export function checkRecorder(): CheckRecorder {
  let failures = 0;

  return {
    check(label, ok, extra) {
      const suffix = extra === undefined ? "" : ` :: ${JSON.stringify(extra)}`;
      console.log(`${ok ? "  OK" : "  FAIL"}: ${label}${suffix}`);
      if (!ok) failures += 1;
    },
    get failures() {
      return failures;
    },
  };
}

export interface CheckRun {
  step(label: string, ok: boolean, extra?: unknown): Promise<void>;
  fail(label: string, extra?: unknown): Promise<never>;
  run(main: () => Promise<void>, success: string): void;
}

export function checkRun(name: string, cleanup: () => Promise<void>): CheckRun {
  const checks = checkRecorder();

  async function fail(label: string, extra?: unknown): Promise<never> {
    checks.check(label, false, extra);
    await cleanup();
    console.error(`\n${name} failed at: ${label}`);
    process.exit(1);
  }

  return {
    fail,
    async step(label, ok, extra) {
      if (!ok) await fail(label, extra);
      checks.check(label, true);
    },
    run(main, success) {
      main()
        .then(async () => {
          await cleanup();
          console.log(`\nAll assertions passed, ${success}.`);
          process.exit(0);
        })
        .catch(async (err) => {
          console.error(`${name} crashed:`, err);
          await cleanup().catch(() => {});
          process.exit(1);
        });
    },
  };
}

export function recordingInstrumentation(): { instrumentation: IInstrumentation; spans: string[] } {
  const spans: string[] = [];
  const instrumentation: IInstrumentation = Object.assign(new NoOpInstrumentation(), {
    startSpan: <T>(options: { name: string; op?: string }, work: () => T): T => {
      if (options.op === "db.query") spans.push(options.name);
      return work();
    },
  });

  return { instrumentation, spans };
}

export function probeClaims<TRow, TRequest>(queue: {
  claim(request: TRequest): Promise<Result<TRow[], unknown>>;
  release(foreign: TRow[]): Promise<unknown>;
  isProbe(row: TRow): boolean;
  fail(label: string, extra?: unknown): Promise<never>;
}): { all(request: TRequest): Promise<TRow[]>; probes(request: TRequest): Promise<TRow[]> } {
  async function all(request: TRequest): Promise<TRow[]> {
    const result = await queue.claim(request);
    if (result.isFailure) return queue.fail("claim succeeds", result.getError());

    const foreign = result.getValue().filter((row) => !queue.isProbe(row));
    if (foreign.length > 0) await queue.release(foreign);

    return result.getValue();
  }

  return {
    all,
    probes: async (request) => (await all(request)).filter((row) => queue.isProbe(row)),
  };
}

export function withClockAhead<T>(ms: number, work: () => Promise<T>): Promise<T> {
  const RealDate = Date;
  class AheadDate extends RealDate {
    constructor(value?: number | string | Date) {
      super(value ?? RealDate.now() + ms);
    }

    static override now(): number {
      return RealDate.now() + ms;
    }
  }
  Object.defineProperty(globalThis, "Date", { value: AheadDate, configurable: true });

  return work().finally(() => {
    Object.defineProperty(globalThis, "Date", { value: RealDate, configurable: true });
  });
}

/** The id of the account `db:seed` creates, or a pointer to the command that creates it. */
export async function findSeededUserId(): Promise<string> {
  const email = seedEmail();
  const [user] = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(eq(authSchema.user.email, email))
    .limit(1);

  if (!user) {
    throw new Error(
      `no user for ${email}: run \`pnpm --filter api db:seed\` first, ` +
        "or point this check at another account with SEED_EMAIL.",
    );
  }
  return user.id;
}

/**
 * Mounts internal routes under `/internal` behind a logger that writes nowhere, or
 * into `lines` when the check needs to read what the route logged.
 */
export function internalApp(routes: Hono, lines?: string[]): Hono {
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines?.push(chunk.toString());
      callback();
    },
  });

  const app = new Hono();
  app.use("*", pinoLogger({ pino: pino(sink) }));
  app.route("/internal", routes);
  return app;
}

/** A POST signed exactly the way `requireInternalSignature` verifies it. */
export async function signedInternalRequest(
  app: Hono,
  path: string,
  body: unknown,
): Promise<Response> {
  const key = env.INTERNAL_SIGNING_KEY;
  if (!key) throw new Error("INTERNAL_SIGNING_KEY is not set, cannot sign a request");

  const rawBody = JSON.stringify(body);
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
    key,
  );

  return app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost",
      [SIGNATURE_HEADER]: buildSignatureHeader(timestamp, signature),
    },
    body: rawBody,
  });
}

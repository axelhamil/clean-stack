/**
 * The pieces every `check-*.ts` script used to redeclare: a pass/fail recorder, the
 * seeded account lookup, and a signed request to an `/internal/*` route mounted on a
 * throwaway app. One copy, so a fix to how a check reports or signs lands everywhere.
 */

import { Writable } from "node:stream";
import { authSchema, db, eq } from "@packages/drizzle";
import { Hono } from "hono";
import { pinoLogger } from "hono-pino";
import { pino } from "pino";
import { env } from "../src/shared/env";
import {
  buildSignatureHeader,
  canonicalize,
  SIGNATURE_HEADER,
  sign,
} from "../src/shared/internal-routes/internal-signature";
import { seedEmail } from "./seed-account";

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

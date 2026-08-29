import {
  DEFAULT_INTERNAL_FETCH_TIMEOUT_MS,
  signedInternalFetch,
} from "../shared/internal-routes/internal-fetch";
import { classifySweepResult } from "./sweep-result";

const baseUrl = process.env.API_URL;
const signingKey = process.env.INTERNAL_SIGNING_KEY;

if (!baseUrl) throw new Error("API_URL is required");
if (!signingKey || signingKey.length < 32) {
  throw new Error("INTERNAL_SIGNING_KEY is required (min 32 chars)");
}

// Kept in sync with `env.INTERNAL_FETCH_TIMEOUT_MS`'s schema default — this script is a
// standalone process reading `process.env` directly and cannot import the API's `env`,
// so it repeats its own defensive parsing rather than inheriting `shared/env.ts`'s
// "" → undefined normalization: an empty string or a non-numeric value must fall back
// to the default rather than yielding `Number.NaN`/`0` and aborting every sweep instantly.
const rawTimeoutMs = process.env.INTERNAL_FETCH_TIMEOUT_MS;
const parsedTimeoutMs = rawTimeoutMs ? Number(rawTimeoutMs) : Number.NaN;
const timeoutMs =
  Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs >= 1000
    ? parsedTimeoutMs
    : DEFAULT_INTERNAL_FETCH_TIMEOUT_MS;

const sweeps = [
  "/internal/sweep-email-messages",
  "/internal/sweep-webhook-delivery",
  "/internal/sweep-audit-log",
  "/internal/sweep-outbox",
  "/internal/sweep-consents",
  "/internal/sweep-notifications",
] as const;

let anyFailure = false;

for (const path of sweeps) {
  const started = Date.now();
  let res: Response;
  try {
    res = await signedInternalFetch({
      baseUrl,
      method: "POST",
      path,
      body: { dryRun: false },
      signingKey,
      timeoutMs,
    });
  } catch (err) {
    // Bun does not document the error raised on abort, so report elapsed time and
    // message rather than matching a name.
    console.error(
      `[sweep] UNREACHABLE ${path} after ${Date.now() - started}ms (budget ${timeoutMs}ms): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    process.exit(1);
  }

  let body: string;
  try {
    body = await res.text();
  } catch (err) {
    console.error(
      `[sweep] TRUNCATED BODY ${path} after ${Date.now() - started}ms: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    process.exit(1);
  }

  if (!res.ok) {
    console.error(
      `[sweep] FAIL ${path} → ${res.status} in ${Date.now() - started}ms: ${body.slice(0, 500)}`,
    );
    process.exit(1);
  }

  const elapsed = Date.now() - started;
  let parsed: {
    truncated?: boolean;
    skipped?: boolean;
    stopReasons?: Record<string, string>;
  };
  try {
    parsed = JSON.parse(body);
  } catch {
    // Substring-matching JSON would misread a reordered or reformatted body; a body
    // that will not parse at all is itself the anomaly worth reporting.
    console.error(`[sweep] UNPARSEABLE ${path} in ${elapsed}ms: ${body.slice(0, 500)}`);
    process.exit(1);
  }

  const classification = classifySweepResult(parsed);

  switch (classification.kind) {
    case "skipped":
      // Healthy under a slow drain, alarming if it never clears: another run holds the
      // lease, which after a crash lasts until the lease expires.
      console.warn(`[sweep] SKIPPED ${path} in ${elapsed}ms — another run holds the lease`);
      break;
    case "batch-error":
      // A batch error recurs every tick until someone looks at the data. Never let it
      // hide behind the truncation warning — but it must not starve every sweep after
      // it either, so accumulate and keep going; the process still exits non-zero.
      console.error(
        `[sweep] BATCH ERROR ${path} in ${elapsed}ms on ${classification.passes.join(", ")}: ${body}`,
      );
      anyFailure = true;
      continue;
    case "truncated":
      // A healthy outcome for a backlog: the budget was spent and the next tick resumes.
      // Truncating on *every* tick is not — it means the backlog outpaces the cadence.
      console.warn(`[sweep] TRUNCATED ${path} in ${elapsed}ms: ${body}`);
      break;
    case "ok":
      console.log(`[sweep] OK ${path} in ${elapsed}ms: ${body}`);
      break;
  }
}

process.exit(anyFailure ? 1 : 0);

import {
  DEFAULT_INTERNAL_FETCH_TIMEOUT_MS,
  signedInternalFetch,
} from "../shared/internal-routes/internal-fetch";
import {
  classifySweepResult,
  type SweepResponseShape,
} from "../shared/internal-routes/sweep-result";
import { HttpHeartbeat } from "./http-heartbeat";

interface InternalJob {
  label: string;
  paths: readonly string[];
  heartbeatUrl?: string;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function timeoutFrom(raw: string | undefined, log: (message: string) => void): number {
  const parsed = raw ? Number(raw) : Number.NaN;
  const valid = Number.isFinite(parsed) && parsed >= 1000;

  if (raw !== undefined && !valid) {
    log(
      `INTERNAL_FETCH_TIMEOUT_MS=${raw} is invalid (must be a number >= 1000), falling back to ${DEFAULT_INTERNAL_FETCH_TIMEOUT_MS}ms`,
    );
  }

  return valid ? parsed : DEFAULT_INTERNAL_FETCH_TIMEOUT_MS;
}

export async function runInternalJob({ label, paths, heartbeatUrl }: InternalJob): Promise<never> {
  const baseUrl = process.env.API_URL;
  const signingKey = process.env.INTERNAL_SIGNING_KEY;

  if (!baseUrl) throw new Error("API_URL is required");
  if (!signingKey || signingKey.length < 32) {
    throw new Error("INTERNAL_SIGNING_KEY is required (min 32 chars)");
  }

  const warn = (message: string) => console.warn(`[${label}] ${message}`);
  const timeoutMs = timeoutFrom(process.env.INTERNAL_FETCH_TIMEOUT_MS, warn);
  const heartbeat = new HttpHeartbeat(heartbeatUrl, warn);

  let anyFailure = false;

  await heartbeat.start();

  for (const path of paths) {
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
      console.error(
        `[${label}] UNREACHABLE ${path} after ${Date.now() - started}ms (budget ${timeoutMs}ms): ${messageOf(err)}`,
      );
      await heartbeat.finish(1);
      process.exit(1);
    }

    let body: string;
    try {
      body = await res.text();
    } catch (err) {
      console.error(
        `[${label}] TRUNCATED BODY ${path} after ${Date.now() - started}ms: ${messageOf(err)}`,
      );
      anyFailure = true;
      continue;
    }

    if (!res.ok) {
      console.error(
        `[${label}] FAIL ${path} → ${res.status} in ${Date.now() - started}ms: ${body.slice(0, 500)}`,
      );
      anyFailure = true;
      continue;
    }

    const elapsed = Date.now() - started;
    let parsed: SweepResponseShape;
    try {
      parsed = JSON.parse(body);
    } catch {
      console.error(`[${label}] UNPARSEABLE ${path} in ${elapsed}ms: ${body.slice(0, 500)}`);
      anyFailure = true;
      continue;
    }

    const classification = classifySweepResult(parsed);

    switch (classification.kind) {
      case "skipped":
        warn(`SKIPPED ${path} in ${elapsed}ms, another run holds the lease`);
        break;
      case "batch-error": {
        const where =
          classification.passes.length > 0 ? ` on ${classification.passes.join(", ")}` : "";
        console.error(`[${label}] BATCH ERROR ${path} in ${elapsed}ms${where}: ${body}`);
        anyFailure = true;
        break;
      }
      case "truncated":
        warn(`TRUNCATED ${path} in ${elapsed}ms: ${body}`);
        break;
      case "ok":
        console.log(`[${label}] OK ${path} in ${elapsed}ms: ${body}`);
        break;
    }
  }

  const exitCode = anyFailure ? 1 : 0;
  await heartbeat.finish(exitCode);
  process.exit(exitCode);
}

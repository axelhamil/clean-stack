import { signedInternalFetch } from "../shared/internal-routes/internal-fetch";
import {
  classifySweepResult,
  type SweepResponseShape,
} from "../shared/internal-routes/sweep-result";
import type { CronEnv } from "./env";
import { HttpHeartbeat } from "./http-heartbeat";
import { cronLogger } from "./logger";

interface InternalJob {
  env: CronEnv;
  label: string;
  paths: readonly string[];
  heartbeatUrl?: string;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runInternalJob({
  env,
  label,
  paths,
  heartbeatUrl,
}: InternalJob): Promise<never> {
  const log = cronLogger.child({ job: label });
  const warn = (message: string) => log.warn(message);
  const timeoutMs = env.INTERNAL_FETCH_TIMEOUT_MS;
  const heartbeat = new HttpHeartbeat(heartbeatUrl, warn);

  let anyFailure = false;

  await heartbeat.start();

  for (const path of paths) {
    const started = Date.now();
    let res: Response;
    try {
      res = await signedInternalFetch({
        baseUrl: env.API_URL,
        method: "POST",
        path,
        body: { dryRun: false },
        signingKey: env.INTERNAL_SIGNING_KEY,
        timeoutMs,
      });
    } catch (err) {
      log.error(
        { path, elapsedMs: Date.now() - started, budgetMs: timeoutMs, reason: messageOf(err) },
        "UNREACHABLE",
      );
      await heartbeat.finish(1);
      process.exit(1);
    }

    let body: string;
    try {
      body = await res.text();
    } catch (err) {
      log.error(
        { path, elapsedMs: Date.now() - started, reason: messageOf(err) },
        "TRUNCATED BODY",
      );
      anyFailure = true;
      continue;
    }

    if (!res.ok) {
      log.error(
        {
          path,
          status: res.status,
          elapsedMs: Date.now() - started,
          body: body.slice(0, 500),
        },
        "FAIL",
      );
      anyFailure = true;
      continue;
    }

    const elapsedMs = Date.now() - started;
    let parsed: SweepResponseShape;
    try {
      parsed = JSON.parse(body);
    } catch {
      log.error({ path, elapsedMs, body: body.slice(0, 500) }, "UNPARSEABLE");
      anyFailure = true;
      continue;
    }

    const classification = classifySweepResult(parsed);

    switch (classification.kind) {
      case "skipped":
        log.warn({ path, elapsedMs }, "SKIPPED, another run is in progress");
        break;
      case "batch-error":
        log.error({ path, elapsedMs, passes: classification.passes, body }, "BATCH ERROR");
        anyFailure = true;
        break;
      case "truncated":
        log.warn({ path, elapsedMs, body }, "TRUNCATED");
        break;
      case "ok":
        log.info({ path, elapsedMs, body }, "OK");
        break;
    }
  }

  const exitCode = anyFailure ? 1 : 0;
  await heartbeat.finish(exitCode);
  process.exit(exitCode);
}

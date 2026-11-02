import { requiredArgument, sleep } from "./cli";
import type { FetchFn } from "./client";

const TRIES = 5;
const DELAY_MS = 5_000;
const CALL_TIMEOUT_MS = 10_000;
const USAGE =
  "usage: bun infra/coolify/gates.ts --api <api base url> --app <app base url> --admin <admin base url>";

interface GateOptions {
  fetchFn?: FetchFn;
  delayMs?: number;
  timeoutMs?: number;
}

interface GateBases {
  api: string;
  app: string;
  admin: string;
}

function join(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

export function gateUrls(bases: GateBases): string[] {
  return [join(bases.api, "/readyz"), join(bases.app, "/health"), join(bases.admin, "/health")];
}

async function statusOf(
  fetchFn: FetchFn,
  url: string,
  timeoutMs: number,
): Promise<number | string> {
  try {
    const response = await fetchFn(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    return response.status;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function checkOk(url: string, options: GateOptions = {}): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  const delayMs = options.delayMs ?? DELAY_MS;
  const timeoutMs = options.timeoutMs ?? CALL_TIMEOUT_MS;
  let last: number | string = "";

  for (let attempt = 1; attempt <= TRIES; attempt += 1) {
    last = await statusOf(fetchFn, url, timeoutMs);

    if (last === 200) {
      return;
    }

    if (attempt < TRIES) {
      await sleep(delayMs);
    }
  }

  throw new Error(`${url} did not answer 200 after ${TRIES} tries, last answer ${last}`);
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const urls = gateUrls({
    api: requiredArgument(argv, "--api", USAGE),
    app: requiredArgument(argv, "--app", USAGE),
    admin: requiredArgument(argv, "--admin", USAGE),
  });

  for (const url of urls) {
    await checkOk(url);
    process.stdout.write(`${url}: 200\n`);
  }
}

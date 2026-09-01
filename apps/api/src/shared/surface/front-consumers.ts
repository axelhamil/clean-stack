import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { RouteKey } from "./back-routes";

export interface FrontConsumer {
  route: RouteKey;
  file: string;
}

const REPO_ROOT = join(import.meta.dir, "../../../../..");
const FRONT_SRC = join(REPO_ROOT, "apps/app/src");

/** `api` followed by any run of `.segment` or `["segment"]`, ending in `.$method`. */
const CALL_SITE = /\bapi((?:\.[A-Za-z0-9_]+|\[["'][^"']+["']\])+)\.\$([a-z]+)/g;
const SEGMENT = /\.([A-Za-z0-9_]+)|\[["']([^"']+)["']\]/g;

export function extractRouteFromChain(chain: string): RouteKey {
  const match = new RegExp(CALL_SITE.source).exec(chain);
  if (!match?.[1] || !match[2]) throw new Error(`not a client call site: ${chain}`);

  const segments: string[] = [];
  for (const seg of match[1].matchAll(SEGMENT)) segments.push(seg[1] ?? seg[2] ?? "");

  return `${match[2].toUpperCase()} /${segments.join("/")}`;
}

export function listFrontConsumers(rootDir = FRONT_SRC): FrontConsumer[] {
  const found: FrontConsumer[] = [];

  for (const file of walk(rootDir)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(CALL_SITE)) {
      found.push({
        route: extractRouteFromChain(match[0]),
        file: relative(REPO_ROOT, file),
      });
    }
  }

  return found.sort((a, b) => a.route.localeCompare(b.route) || a.file.localeCompare(b.file));
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__TESTS__" || entry === "node_modules") continue;
      yield* walk(full);
      continue;
    }
    if (/\.tsx?$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      yield full;
    }
  }
}

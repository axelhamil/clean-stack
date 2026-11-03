import { describe, expect, test } from "bun:test";
import { file, Glob } from "bun";
import { envSchema, PRODUCTION_REQUIRED } from "../../apps/api/src/shared/env-schema";
import { servicesFor } from "./services";

const CRON_DIR = new URL("../../apps/api/src/cron/", import.meta.url).pathname;

const fields = Object.entries(envSchema.shape);

const requiredByApi = [
  ...fields.filter(([, schema]) => !schema.safeParse(undefined).success).map(([key]) => key),
  ...PRODUCTION_REQUIRED.map(([key]) => key),
];

async function cronKeys(): Promise<string[]> {
  const sources = await Promise.all(
    [...new Glob("*.ts").scanSync(CRON_DIR)].map((name) => file(`${CRON_DIR}${name}`).text()),
  );

  return sources.flatMap((source) =>
    [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].flatMap(([, key]) => (key ? [key] : [])),
  );
}

async function keysKnownToApi(): Promise<Set<string>> {
  return new Set([...fields.map(([key]) => key), ...(await cronKeys())]);
}

function declaredApiKeys(): string[] {
  const api = servicesFor("production", "owner").find((app) => app.name === "api");

  return Object.keys(api?.env ?? {});
}

describe("api env drift", () => {
  test("declares every key the api requires in production", () => {
    const declared = new Set(declaredApiKeys());

    expect(requiredByApi.filter((key) => !declared.has(key))).toEqual([]);
  });

  test("declares no key the api or its cron never reads", async () => {
    const known = await keysKnownToApi();

    expect(declaredApiKeys().filter((key) => !known.has(key))).toEqual([]);
  });
});

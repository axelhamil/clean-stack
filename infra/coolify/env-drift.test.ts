import { describe, expect, test } from "bun:test";
import { file } from "bun";
import { envSchema, PRODUCTION_REQUIRED } from "../../apps/api/src/shared/env-schema";
import { servicesFor } from "./services";

const SWEEP_SOURCE = new URL("../../apps/api/src/cron/sweep.ts", import.meta.url);

const fields = Object.entries(envSchema.shape);

const requiredByApi = [
  ...fields.filter(([, schema]) => !schema.safeParse(undefined).success).map(([key]) => key),
  ...PRODUCTION_REQUIRED.map(([key]) => key),
];

async function keysKnownToApi(): Promise<Set<string>> {
  const sweep = await file(SWEEP_SOURCE).text();
  const sweepKeys = [...sweep.matchAll(/process\.env\.([A-Z0-9_]+)/g)].flatMap(([, key]) =>
    key ? [key] : [],
  );

  return new Set([...fields.map(([key]) => key), ...sweepKeys]);
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

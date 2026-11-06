import { describe, expect, test } from "bun:test";
import { cronEnvSchema } from "../../apps/api/src/cron/env";
import { envSchema, PRODUCTION_REQUIRED } from "../../apps/api/src/shared/env-schema";
import { servicesFor } from "./services";

const fields = Object.entries(envSchema.shape);

const requiredByApi = [
  ...fields.filter(([, schema]) => !schema.safeParse(undefined).success).map(([key]) => key),
  ...PRODUCTION_REQUIRED.map(([key]) => key),
];

function keysKnownToApi(): Set<string> {
  return new Set([...fields.map(([key]) => key), ...Object.keys(cronEnvSchema.shape)]);
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

  test("declares no key the api or its cron never reads", () => {
    const known = keysKnownToApi();

    expect(declaredApiKeys().filter((key) => !known.has(key))).toEqual([]);
  });
});

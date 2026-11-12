import { afterEach, describe, expect, it, vi } from "vitest";
import { requireLocalDatabase } from "../require-local-database";

function refuses(databaseUrl: string | undefined): boolean {
  vi.stubEnv("DATABASE_URL", databaseUrl);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

  requireLocalDatabase("check-test");

  return exit.mock.calls.some(([code]) => code === 1);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("requireLocalDatabase", () => {
  it.each([
    "postgresql://postgres:postgres@localhost:5433/clean_stack",
    "postgres://u:p@127.0.0.1:5432/app",
    "postgres://localhost/app",
  ])("accepts %s", (url) => {
    expect(refuses(url)).toBe(false);
  });

  it.each([
    "postgresql://u:p@evil.invalid-localhost:5432/app",
    "postgresql://u:p@localhost.evil.test:5432/app",
    "postgresql://localhost:p@db.example.com:5432/app",
    "postgresql://u:p@db.example.com:5432/app",
    "mysql://u:p@localhost:3306/app",
    "",
    undefined,
  ])("refuses %s", (url) => {
    expect(refuses(url)).toBe(true);
  });
});

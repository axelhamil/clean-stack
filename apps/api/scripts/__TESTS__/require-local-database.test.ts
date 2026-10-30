import { describe, expect, it } from "bun:test";
import { requireSeedableDatabase } from "../require-local-database";

describe("requireSeedableDatabase", () => {
  it.each(["localhost", "127.0.0.1", "postgres"])("accepts the host %s", (host) => {
    expect(() => requireSeedableDatabase(`postgres://u:p@${host}:5432/db`)).not.toThrow();
  });

  it.each([
    "postgres://u:p@db.example.com:5432/db",
    "postgres://localhost:p@db.example.com:5432/db",
    "postgres://u:p@localhost.example.com:5432/db",
    "postgres://u:p@postgres.railway.internal:5432/db",
    "",
    undefined,
  ])("refuses %s", (url) => {
    expect(() => requireSeedableDatabase(url)).toThrow(/public TOTP secret/);
  });
});

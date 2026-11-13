import { describe, expect, it } from "bun:test";
import { join } from "node:path";

describe("env at boot", () => {
  it("reads a blank ADMIN_URL and AUTH_COOKIE_DOMAIN as absent", async () => {
    // biome-ignore lint/correctness/noUndeclaredVariables: Bun global available at runtime
    const boot = Bun.spawn(
      [
        process.execPath,
        "-e",
        'const { env } = await import("./src/shared/env.ts"); console.log(JSON.stringify([env.ADMIN_URL ?? null, env.AUTH_COOKIE_DOMAIN ?? null]));',
      ],
      {
        cwd: join(import.meta.dir, "../../.."),
        env: {
          ...process.env,
          NODE_ENV: "development",
          ADMIN_URL: "",
          AUTH_COOKIE_DOMAIN: "",
          APP_URL: "http://localhost:5173",
          BETTER_AUTH_URL: "http://localhost:3000",
          BETTER_AUTH_SECRET: "a".repeat(40),
          DATABASE_URL: "postgres://user:pass@localhost:5433/db",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    expect(await new Response(boot.stdout).text()).toContain("[null,null]");
    expect(await boot.exited).toBe(0);
  });
});

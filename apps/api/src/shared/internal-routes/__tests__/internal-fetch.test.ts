import { describe, expect, it } from "bun:test";
import { signedInternalFetch } from "../internal-fetch";

const SIGNING_KEY = "0".repeat(64);

describe("signedInternalFetch", () => {
  it("aborts a request that outlives timeoutMs", async () => {
    // biome-ignore lint/correctness/noUndeclaredVariables: Bun global available at runtime
    const server = Bun.serve({
      port: 0,
      idleTimeout: 0,
      async fetch() {
        // biome-ignore lint/correctness/noUndeclaredVariables: Bun global available at runtime
        await Bun.sleep(500);
        return new Response("late");
      },
    });

    try {
      const call = signedInternalFetch({
        baseUrl: server.url.origin,
        method: "POST",
        path: "/internal/slow",
        body: { dryRun: true },
        signingKey: SIGNING_KEY,
        timeoutMs: 50,
      });
      // Awaited on purpose: an un-awaited rejects assertion is a floating promise and
      // the test would report green without ever checking it.
      // Bun does not document the error raised on abort, so assert the rejection only.
      await expect(call).rejects.toThrow();
    } finally {
      server.stop(true);
    }
  });

  it("returns the response when the server answers inside the budget", async () => {
    // biome-ignore lint/correctness/noUndeclaredVariables: Bun global available at runtime
    const server = Bun.serve({
      port: 0,
      idleTimeout: 0,
      fetch: () => new Response("ok"),
    });

    try {
      const res = await signedInternalFetch({
        baseUrl: server.url.origin,
        method: "POST",
        path: "/internal/fast",
        body: { dryRun: true },
        signingKey: SIGNING_KEY,
        timeoutMs: 5_000,
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("ok");
    } finally {
      server.stop(true);
    }
  });
});

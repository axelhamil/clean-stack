import { describe, expect, it } from "bun:test";
import { buildServerOptions } from "../server-options";
import { DEFAULT_SWEEP_DEADLINE_MS } from "../shared/internal-routes/sweep-runner";

describe("buildServerOptions", () => {
  it("passes the idle timeout through in seconds", () => {
    expect(buildServerOptions({ port: 3000, idleTimeoutSeconds: 120 })).toEqual({
      port: 3000,
      idleTimeout: 120,
    });
  });

  it("keeps port undefined so Bun applies its own default", () => {
    expect(buildServerOptions({ idleTimeoutSeconds: 120 }).port).toBeUndefined();
  });

  // Measured, not assumed: a handler silent past idleTimeout has its socket closed
  // while it keeps running. The default idle timeout must therefore outlast the
  // default sweep budget, or a truncated sweep can never deliver its own answer.
  it("leaves the default idle timeout longer than the default sweep budget", () => {
    const { idleTimeout } = buildServerOptions({ idleTimeoutSeconds: 120 });
    expect(idleTimeout * 1000).toBeGreaterThan(DEFAULT_SWEEP_DEADLINE_MS);
  });

  // The notification SSE stream pings every 25s; anything at or below that drops
  // every stream on a cadence nobody would connect to the sweep configuration.
  it("leaves the default idle timeout longer than the SSE heartbeat", () => {
    expect(buildServerOptions({ idleTimeoutSeconds: 120 }).idleTimeout).toBeGreaterThan(25);
  });
});

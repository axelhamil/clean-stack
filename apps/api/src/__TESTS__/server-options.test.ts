import { describe, expect, it } from "bun:test";
import { buildServerOptions } from "../server-options";

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
});

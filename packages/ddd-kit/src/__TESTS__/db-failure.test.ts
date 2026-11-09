import { describe, expect, it, vi } from "vitest";
import { createDbFailure } from "../application/db-failure";
import type { ILogger } from "../application/logger";

const DRIVER_TEXT = 'password authentication failed for user "app"';
const driverError = new Error(DRIVER_TEXT);

const logger: ILogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("createDbFailure", () => {
  it("keeps the driver text out of the returned error", () => {
    const error = createDbFailure("STORAGE_PROVIDER_FAILURE", logger)(
      driverError,
      "put failed",
    ).getError();
    expect(JSON.stringify(error)).not.toContain(DRIVER_TEXT);
    expect(error.message).toBe("put failed");
  });
});

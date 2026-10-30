import { describe, expect, it, mock } from "bun:test";

const errorLog = mock((_fields: unknown, _message: string) => {});
const realLogger = await import("../logger");
mock.module("../logger", () => ({
  ...realLogger,
  logger: { ...realLogger.logger, error: errorLog },
}));

const { createDbFailure, dbOperationFailure } = await import("../db-failure");

const DRIVER_TEXT = 'password authentication failed for user "app"';
const driverError = new Error(DRIVER_TEXT);

describe("createDbFailure", () => {
  it("keeps the driver text out of the returned error", () => {
    const error = createDbFailure("STORAGE_PROVIDER_FAILURE")(driverError, "put failed").getError();
    expect(JSON.stringify(error)).not.toContain(DRIVER_TEXT);
    expect(error.message).toBe("put failed");
  });
});

describe("dbOperationFailure", () => {
  it("keeps the driver text out of the returned error", () => {
    const error = dbOperationFailure("PROFILE_PROVIDER_FAILURE")(driverError, "update");
    expect(JSON.stringify(error)).not.toContain(DRIVER_TEXT);
    expect(error.message).toBe("database operation failed: update");
  });

  it("logs the driver error", () => {
    errorLog.mockClear();
    dbOperationFailure("PROFILE_PROVIDER_FAILURE")(driverError, "update");
    expect(errorLog.mock.calls[0]?.[0]).toMatchObject({ err: driverError });
  });
});

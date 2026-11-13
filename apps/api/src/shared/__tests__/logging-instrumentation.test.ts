import { describe, expect, it, mock } from "bun:test";
import { LoggingInstrumentation } from "../services/logging-instrumentation";

describe("LoggingInstrumentation", () => {
  it("writes a captured driver error to the log, so a store failure is seen without a provider", () => {
    const error = mock((_fields: unknown, _message: string) => {});
    const driverError = new Error("connection refused");

    new LoggingInstrumentation({ error }).capture(driverError);

    expect(error.mock.calls[0]?.[0]).toMatchObject({ err: driverError });
  });
});

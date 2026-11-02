import type { ErrorContext } from "../ports/instrumentation.port";
import { NoOpInstrumentation } from "./noop-instrumentation";

interface ErrorLogger {
  error(fields: object, message: string): void;
}

export class LoggingInstrumentation extends NoOpInstrumentation {
  constructor(private readonly logger: ErrorLogger) {
    super();
  }

  override capture(error: unknown, context?: ErrorContext): void {
    this.logger.error({ err: error, ...context }, "captured error");
  }
}

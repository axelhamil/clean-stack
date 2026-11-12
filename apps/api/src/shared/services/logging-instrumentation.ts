import { type ErrorContext, NoOpInstrumentation } from "@packages/ddd-kit";

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

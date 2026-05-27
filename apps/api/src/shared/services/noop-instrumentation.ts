import type {
  Breadcrumb,
  ErrorContext,
  IInstrumentation,
  SpanOptions,
} from "../ports/instrumentation.port";

export class NoOpInstrumentation implements IInstrumentation {
  startSpan<T>(_options: SpanOptions, callback: () => T | Promise<T>): T | Promise<T> {
    return callback();
  }
  capture(_error: unknown, _context?: ErrorContext): void {}
  addBreadcrumb(_crumb: Breadcrumb): void {}
}

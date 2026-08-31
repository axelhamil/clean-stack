export interface SpanOptions {
  name: string;
  op?: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  orgId?: string;
  path?: string;
  method?: string;
  metadata?: Record<string, unknown>;
}

export interface Breadcrumb {
  category?: string;
  message: string;
  level?: "debug" | "info" | "warning" | "error" | "fatal";
  data?: Record<string, unknown>;
}

export interface IInstrumentation {
  startSpan<T>(options: SpanOptions, callback: () => Promise<T>): Promise<T>;
  startSpan<T>(options: SpanOptions, callback: () => T): T;
  capture(error: unknown, context?: ErrorContext): void;
  addBreadcrumb(crumb: Breadcrumb): void;
  /**
   * Writes attributes onto the span currently open around the caller. `SpanOptions`
   * is open-time only, and the facts worth recording about a span — how many rows a
   * pass deleted, why it stopped — are known only as it closes.
   */
  setSpanAttributes(attributes: Record<string, string | number | boolean>): void;
}

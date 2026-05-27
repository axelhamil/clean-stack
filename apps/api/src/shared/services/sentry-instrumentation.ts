import * as Sentry from "@sentry/bun";
import type {
  Breadcrumb,
  ErrorContext,
  IInstrumentation,
  SpanOptions,
} from "../ports/instrumentation.port";

export class SentryInstrumentation implements IInstrumentation {
  startSpan<T>(options: SpanOptions, callback: () => T | Promise<T>): T | Promise<T> {
    return Sentry.startSpan(
      { name: options.name, op: options.op, attributes: options.attributes },
      () => callback(),
    );
  }

  capture(error: unknown, context?: ErrorContext): void {
    Sentry.withScope((scope) => {
      if (context?.requestId) scope.setTag("requestId", context.requestId);
      if (context?.userId) scope.setUser({ id: context.userId });
      if (context?.orgId) scope.setTag("orgId", context.orgId);
      if (context?.path) scope.setTag("path", context.path);
      if (context?.method) scope.setTag("method", context.method);
      if (context?.metadata) scope.setContext("metadata", context.metadata);
      Sentry.captureException(error);
    });
  }

  addBreadcrumb(crumb: Breadcrumb): void {
    Sentry.addBreadcrumb({
      category: crumb.category,
      message: crumb.message,
      level: crumb.level,
      data: crumb.data,
    });
  }
}

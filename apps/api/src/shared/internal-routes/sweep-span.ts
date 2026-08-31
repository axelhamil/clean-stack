import type { IInstrumentation, SpanOptions } from "../ports/instrumentation.port";

const DB_ATTRS = { "db.system.name": "postgresql" } as const;

/**
 * How many per-batch `db.query` spans a single sweep run may open.
 *
 * `MAX_BATCHES` is 1000 and every batch would otherwise open a span. Sentry caps a
 * transaction at ~1000 spans and drops the overflow silently *from the end* — which
 * would discard the later passes and the lease release, the spans most worth having.
 * A run of 400 identical batched deletes is not 400x more informative than 50.
 */
export const MAX_INSTRUMENTED_BATCHES = 50;

/**
 * The sweep rail's stand-in for constructor-injected instrumentation.
 *
 * Rule #8 asks for `IInstrumentation` on the constructor, but this rail is functional:
 * the runner, the lease and the purge helpers are plain functions with no class to
 * inject into. A `SweepSpans` is built once per request from `di.IInstrumentation` and
 * threaded down explicitly instead, keeping both properties the rule is protecting —
 * no module-level singleton (two labels can sweep concurrently without sharing a
 * budget), and a test builds one over `NoOpInstrumentation` and spies on it.
 */
export type SweepSpans = {
  span<T>(options: SpanOptions, run: () => Promise<T>): Promise<T>;
  db<T>(sql: string, run: () => Promise<T>): Promise<T>;
  attributes(attrs: Record<string, string | number | boolean>): void;
  capture(error: unknown, metadata: Record<string, unknown>): void;
};

export function sweepSpans(
  instrumentation: IInstrumentation,
  maxDbSpans: number = MAX_INSTRUMENTED_BATCHES,
): SweepSpans {
  let remaining = maxDbSpans;
  return {
    span: (options, run) => instrumentation.startSpan(options, run),
    db: (sql, run) => {
      // Past the budget the query still runs — the trace loses resolution, never work.
      if (remaining <= 0) return run();
      remaining--;
      return instrumentation.startSpan({ name: sql, op: "db.query", attributes: DB_ATTRS }, run);
    },
    attributes: (attrs) => instrumentation.setSpanAttributes(attrs),
    capture: (error, metadata) => instrumentation.capture(error, { metadata }),
  };
}

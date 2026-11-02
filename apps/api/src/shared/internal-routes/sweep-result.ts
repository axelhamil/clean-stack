export interface SweepResponseShape {
  truncated?: boolean;
  skipped?: boolean;
  stopReasons?: Record<string, string>;
}

export type SweepClassification =
  | { kind: "skipped" }
  | { kind: "batch-error"; passes: string[] }
  | { kind: "truncated" }
  | { kind: "ok" };

/**
 * Decides how a parsed sweep response should be reported, in priority order:
 * a skipped run (lease held elsewhere) beats everything else because nothing
 * happened; a batch error beats a mere truncation because it recurs every
 * tick until someone looks at the data, whereas truncation alone is an
 * honest, self-resolving backlog signal.
 */
export function classifySweepResult(parsed: SweepResponseShape): SweepClassification {
  if (parsed.skipped) return { kind: "skipped" };

  const errored = Object.entries(parsed.stopReasons ?? {}).filter(
    ([, reason]) => reason === "batch-error",
  );
  if (errored.length > 0) return { kind: "batch-error", passes: errored.map(([pass]) => pass) };

  if (parsed.truncated) return { kind: "truncated" };

  return { kind: "ok" };
}

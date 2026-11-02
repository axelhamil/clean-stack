import type { Logger } from "pino";
import { raceWithTimeout } from "./race-with-timeout";

let shuttingDown = false;
let started = false;

export const lifecycleState = {
  signalShutdown: (): void => {
    shuttingDown = true;
  },
  isShuttingDown: (): boolean => shuttingDown,
  markStarted: (): void => {
    started = true;
  },
  isStarted: (): boolean => started,
};

export const GRACE_MARGIN_MS = 1_000;
export const TELEMETRY_FLUSH_TIMEOUT_MS = 2_000;
export const TELEMETRY_FLUSH_MARGIN_MS = 500;
export const DEADLINE_FLUSH_TIMEOUT_MS = 1_000;

const HTTP_FORCE_CLOSE_MARGIN_MS = 250;
const DEFAULT_STEP_TIMEOUT_MS = 5_000;
const SIGNALS = ["SIGTERM", "SIGINT"] as const;

export interface ShutdownStep {
  name: string;
  timeoutMs?: number;
  skipAfterTimeoutOf?: string;
  run(): Promise<void>;
}

export interface ShutdownBudget {
  graceMs: number;
  stepMs: number;
  workersMs: number;
}

interface StoppableServer {
  stop(closeActiveConnections?: boolean): Promise<void>;
}

interface ShutdownOptions {
  deadlineMs: number;
  logger: Logger;
  exit: (code: number) => void;
  flushOnDeadline?: () => Promise<void>;
}

type StepOutcome = { kind: "done" } | { kind: "failed"; error: unknown } | { kind: "timeout" };

export function worstCaseShutdownMs({ graceMs, stepMs, workersMs }: ShutdownBudget): number {
  const httpAndPoolMs = 2 * stepMs;
  const telemetryMs = TELEMETRY_FLUSH_TIMEOUT_MS + TELEMETRY_FLUSH_MARGIN_MS;

  return (
    graceMs + GRACE_MARGIN_MS + httpAndPoolMs + workersMs + telemetryMs + DEADLINE_FLUSH_TIMEOUT_MS
  );
}

export async function drainHttpServer(server: StoppableServer, budgetMs: number): Promise<void> {
  const drainMs = Math.max(budgetMs - HTTP_FORCE_CLOSE_MARGIN_MS, 0);
  const drained = await raceWithTimeout(
    server.stop().then(() => true),
    drainMs,
    () => false,
  );

  if (!drained) await server.stop(true);
}

function runStep(step: ShutdownStep): Promise<StepOutcome> {
  const settled = Promise.resolve()
    .then(() => step.run())
    .then(
      (): StepOutcome => ({ kind: "done" }),
      (error: unknown): StepOutcome => ({ kind: "failed", error }),
    );

  return raceWithTimeout(
    settled,
    step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
    (): StepOutcome => ({ kind: "timeout" }),
  );
}

async function runAll(steps: ShutdownStep[], logger: Logger): Promise<boolean> {
  let allDone = true;
  const timedOut = new Set<string>();

  for (const step of steps) {
    if (step.skipAfterTimeoutOf && timedOut.has(step.skipAfterTimeoutOf)) {
      logger.warn({ step: step.name, timedOut: step.skipAfterTimeoutOf }, "shutdown step skipped");
      continue;
    }

    const outcome = await runStep(step);

    if (outcome.kind === "done") {
      logger.info({ step: step.name }, "shutdown step done");
      continue;
    }

    allDone = false;
    if (outcome.kind === "failed") {
      logger.error({ err: outcome.error, step: step.name }, "shutdown step failed, going on");
      continue;
    }

    timedOut.add(step.name);
    logger.error({ step: step.name }, "shutdown step timed out, going on");
  }

  return allDone;
}

export async function runShutdown(
  steps: ShutdownStep[],
  { deadlineMs, logger, exit, flushOnDeadline }: ShutdownOptions,
): Promise<void> {
  const outcome = await raceWithTimeout<boolean | "deadline">(
    runAll(steps, logger),
    deadlineMs,
    () => "deadline",
  );

  if (outcome !== "deadline") {
    exit(outcome ? 0 : 1);
    return;
  }

  logger.error({ deadlineMs }, "shutdown deadline reached, exiting");
  if (flushOnDeadline)
    await runStep({
      name: "deadline-flush",
      timeoutMs: DEADLINE_FLUSH_TIMEOUT_MS,
      run: flushOnDeadline,
    });
  exit(1);
}

export function installShutdown(steps: ShutdownStep[], options: ShutdownOptions): () => void {
  let stopping = false;

  const onSignal = (signal: NodeJS.Signals) => {
    if (stopping) {
      options.logger.warn({ signal }, "second shutdown signal, exiting now");
      options.exit(1);
      return;
    }

    stopping = true;
    options.logger.info({ signal }, "shutdown signal received");
    void runShutdown(steps, options);
  };

  for (const signal of SIGNALS) process.on(signal, onSignal);

  return () => {
    for (const signal of SIGNALS) process.off(signal, onSignal);
  };
}

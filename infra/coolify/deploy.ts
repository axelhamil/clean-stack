import { argument, required, sleep } from "./cli";
import { CoolifyClient, type Snapshot } from "./client";
import {
  APP_ORDER,
  type AppName,
  type CoolifyApp,
  type CoolifyEnvironment,
  findApp,
  isEnvironment,
  parseDigestRef,
  servicesFor,
} from "./services";

type Digests = Partial<Record<AppName, string>>;

interface TaskWait {
  timeoutMs: number;
  pollMs: number;
}

export interface DeployOptions {
  environment: CoolifyEnvironment;
  owner: string;
  release: string;
  digests: Digests;
  taskWait?: TaskWait;
  budgetMs?: number;
}

interface DeployDeps {
  client: Pick<
    CoolifyClient,
    | "environmentId"
    | "listApplicationSummaries"
    | "runningTasks"
    | "snapshot"
    | "restore"
    | "setEnv"
    | "deploy"
    | "waitForDeployment"
  >;
  projectUuid: string;
  log: (line: string) => void;
}

type Outcome =
  | { kind: "deployed"; image: string }
  | { kind: "restored"; previous: Snapshot; timedOut: boolean; release: string }
  | { kind: "unrestored"; reason: string }
  | { kind: "skipped" }
  | { kind: "pending" };

export const DEPLOY_BUDGET_MINUTES = 45;

const RELEASE = /^[0-9a-f]{40}$/;
const WAIT = { timeoutMs: 20 * 60_000, pollMs: 5_000 };
const DEFAULT_TASK_WAIT: TaskWait = { timeoutMs: 30 * 60_000, pollMs: 30_000 };
const USAGE =
  "usage: bun infra/coolify/deploy.ts --environment <staging|production> --owner <ghcr owner> --release <commit sha> [--api <ref>] [--app <ref>] [--admin <ref>]";

function parseDigests(refs: Digests, owner: string): Digests {
  const digests: Digests = {};

  for (const name of APP_ORDER) {
    const ref = refs[name];

    if (ref === undefined) {
      continue;
    }

    const parsed = parseDigestRef(ref);

    if (parsed.owner !== owner || parsed.name !== name) {
      throw new Error(`${name} must run ghcr.io/${owner}/clean-stack-${name}, not ${ref}`);
    }

    digests[name] = parsed.ref;
  }

  if (Object.keys(digests).length === 0) {
    throw new Error("no image to deploy: pass --api, --app or --admin");
  }

  return digests;
}

export function parseArgs(argv: readonly string[]): DeployOptions {
  const environment = argument(argv, "--environment");
  const owner = argument(argv, "--owner")?.toLowerCase();
  const release = argument(argv, "--release");

  if (!isEnvironment(environment) || !owner || !release) {
    throw new Error(USAGE);
  }

  const refs = Object.fromEntries(
    APP_ORDER.flatMap((name) => {
      const ref = argument(argv, `--${name}`);

      return ref ? [[name, ref]] : [];
    }),
  );

  return { environment, owner, release, digests: parseDigests(refs, owner) };
}

async function idleTasks(
  client: DeployDeps["client"],
  uuid: string,
  holding: readonly string[],
  wait: TaskWait,
): Promise<string[]> {
  const deadline = Date.now() + wait.timeoutMs;
  const runningHolders = () => client.runningTasks(uuid, holding);
  let running = await runningHolders();

  while (running.length > 0 && Date.now() < deadline) {
    await sleep(Math.min(wait.pollMs, Math.max(0, deadline - Date.now())));
    running = await runningHolders();
  }

  return running;
}

function restoredLine(name: AppName, outcome: Extract<Outcome, { kind: "restored" }>): string {
  const head = outcome.timedOut
    ? `${name}: still running in Coolify after the wait, config restored to ${outcome.previous.image}`
    : `${name}: deployment failed, restored to ${outcome.previous.image}`;
  const unreadable = Object.entries(outcome.previous.env).filter(
    ([, value]) => value === undefined,
  );

  if (unreadable.length === 0) {
    return head;
  }

  return `${head}, its previous ${unreadable.map(([key]) => key).join(", ")} is unreadable so it stays ${outcome.release}`;
}

function reportLine(name: AppName, outcome: Outcome): string {
  switch (outcome.kind) {
    case "deployed":
      return `${name}: deployed ${outcome.image}`;
    case "restored":
      return restoredLine(name, outcome);
    case "unrestored":
      return `${name}: deployment failed and restore failed, fix its image and GIT_SHA in Coolify now: ${outcome.reason}`;
    case "skipped":
      return `${name}: skipped, left on its previous image`;
    case "pending":
      return `${name}: not deployed, left on its previous image`;
  }
}

function releaseKeys(app: CoolifyApp): string[] {
  return Object.entries(app.env)
    .filter(([, source]) => source.kind === "release")
    .map(([key]) => key);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runDeploy(options: DeployOptions, deps: DeployDeps): Promise<void> {
  if (!RELEASE.test(options.release)) {
    throw new Error(`release ${options.release} is not a full commit sha`);
  }

  const deadline = Date.now() + (options.budgetMs ?? DEPLOY_BUDGET_MINUTES * 60_000);
  const remaining = () => Math.max(0, deadline - Date.now());
  const desired = servicesFor(options.environment, options.owner);
  const environmentId = await deps.client.environmentId(deps.projectUuid, options.environment);
  const remote = await deps.client.listApplicationSummaries(environmentId);
  const targets = APP_ORDER.flatMap((name) => {
    const image = options.digests[name];

    if (image === undefined) {
      return [];
    }

    const app = desired.find((candidate) => candidate.name === name);
    const target = findApp(remote, name, options.environment);

    if (!app || !target) {
      throw new Error(
        `${name} is missing from coolify in ${options.environment}: run infra/coolify/apply.ts first`,
      );
    }

    return [{ name, image, app, uuid: target.uuid }];
  });
  const outcomes = new Map<AppName, Outcome>(
    targets.map(({ name }) => [name, { kind: "pending" }]),
  );

  try {
    for (const { name, image, app, uuid } of targets) {
      if (remaining() === 0) {
        throw new Error(`deploy time budget spent before ${name}`);
      }

      const holding = app.tasks.filter((task) => task.holdsDeploy).map((task) => task.name);

      if (holding.length > 0) {
        const wait = options.taskWait ?? DEFAULT_TASK_WAIT;
        const running = await idleTasks(deps.client, uuid, holding, {
          ...wait,
          timeoutMs: Math.min(wait.timeoutMs, remaining()),
        });

        if (running.length > 0) {
          outcomes.set(name, { kind: "skipped" });
          deps.log(
            `warning: ${name} skipped, its task ${running.join(", ")} still runs, redeploy it once the task ends`,
          );
          throw new Error(`${name} skipped while its task ${running.join(", ")} runs`);
        }
      }

      const keys = releaseKeys(app);
      const previous = await deps.client.snapshot(uuid, keys);

      try {
        await deps.client.setEnv(
          uuid,
          Object.fromEntries(keys.map((key) => [key, options.release])),
        );

        const deployment = await deps.client.deploy(uuid, image);
        deps.log(`${name}: deployment ${deployment} started for ${image}`);
        await deps.client.waitForDeployment(deployment, {
          ...WAIT,
          timeoutMs: Math.min(WAIT.timeoutMs, remaining()),
        });
        outcomes.set(name, { kind: "deployed", image });
      } catch (error) {
        const timedOut = messageOf(error).includes("timed out");

        try {
          await deps.client.restore(uuid, previous);
        } catch (restoreError) {
          outcomes.set(name, { kind: "unrestored", reason: messageOf(restoreError) });
          throw new Error(`${messageOf(error)}, then restore failed: ${messageOf(restoreError)}`);
        }

        outcomes.set(name, { kind: "restored", previous, timedOut, release: options.release });
        throw error;
      }
    }
  } finally {
    for (const [name, outcome] of outcomes) {
      deps.log(reportLine(name, outcome));
    }
  }
}

if (import.meta.main) {
  await runDeploy(parseArgs(process.argv.slice(2)), {
    client: new CoolifyClient(required("COOLIFY_API_URL"), required("COOLIFY_DEPLOY_TOKEN")),
    projectUuid: required("COOLIFY_PROJECT_UUID"),
    log: (line) => process.stdout.write(`${line}\n`),
  });
}

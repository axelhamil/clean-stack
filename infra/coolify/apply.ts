import { argument, required } from "./cli";
import { CoolifyClient, type Placement, type RemoteApp } from "./client";
import {
  type AppState,
  type CoolifyApp,
  type CoolifyEnvironment,
  findApp,
  isEnvironment,
  servicesFor,
  stateOf,
} from "./services";

interface Change {
  kind: "create" | "update";
  name: string;
  fields: string[];
}

interface AppKeys {
  name: string;
  keys: string[];
}

export interface Plan {
  changes: Change[];
  missing: AppKeys[];
  unknown: AppKeys[];
}

export interface ApplyOptions {
  environment: CoolifyEnvironment;
  owner: string;
  apply: boolean;
}

interface ApplyDeps {
  client: Pick<
    CoolifyClient,
    "environmentId" | "listApplications" | "upsertApplication" | "setEnv"
  >;
  placement: Placement;
  log: (line: string) => void;
}

const SCALAR_FIELDS = [
  "image",
  "port",
  "healthCheck",
  "stopGraceSeconds",
] satisfies (keyof AppState)[];

const USAGE =
  "usage: bun infra/coolify/apply.ts --environment <staging|production> --owner <ghcr owner> [--apply]";

function sameTask(
  want: AppState["tasks"][number],
  have: RemoteApp["tasks"][number] | undefined,
): boolean {
  return (
    have !== undefined &&
    have.command === want.command &&
    have.schedule === want.schedule &&
    have.timeoutSeconds === want.timeoutSeconds &&
    have.enabled === want.enabled
  );
}

function differingFields(want: AppState, have: RemoteApp | undefined): string[] {
  const scalars = SCALAR_FIELDS.filter((field) => have?.[field] !== want[field]);
  const env = Object.entries(want.env)
    .filter(([key, value]) => {
      const current = have?.env.get(key);

      return !have?.env.has(key) || (current !== undefined && current !== value);
    })
    .map(([key]) => `env.${key}`);
  const tasks = want.tasks
    .filter(
      (task) =>
        !sameTask(
          task,
          have?.tasks.find((remote) => remote.name === task.name),
        ),
    )
    .map((task) => `task.${task.name}`);

  return [...scalars, ...env, ...tasks];
}

export function plan(
  desired: readonly CoolifyApp[],
  remote: readonly RemoteApp[],
  environment: CoolifyEnvironment,
): Plan {
  const changes: Change[] = [];
  const missing: AppKeys[] = [];
  const unknown: AppKeys[] = [];

  for (const app of desired) {
    const have = findApp(remote, app.name, environment);
    const want = stateOf(app);
    const fields = differingFields(want, have);
    const keys = want.secrets.filter((key) => !have?.env.has(key) || have.env.get(key) === "");
    const hidden = Object.keys(want.env).filter(
      (key) => have?.env.has(key) && have.env.get(key) === undefined,
    );

    if (!have) {
      changes.push({ kind: "create", name: app.name, fields });
    }

    if (have && fields.length > 0) {
      changes.push({ kind: "update", name: app.name, fields });
    }

    if (keys.length > 0) {
      missing.push({ name: app.name, keys });
    }

    if (hidden.length > 0) {
      unknown.push({ name: app.name, keys: hidden });
    }
  }

  return { changes, missing, unknown };
}

export async function runApply(options: ApplyOptions, deps: ApplyDeps): Promise<Plan> {
  const desired = servicesFor(options.environment, options.owner);
  const environmentId = await deps.client.environmentId(
    deps.placement.projectUuid,
    options.environment,
  );
  const remote = await deps.client.listApplications(environmentId);
  const result = plan(desired, remote, options.environment);

  for (const change of result.changes) {
    deps.log(`${change.kind} ${change.name}: ${change.fields.join(", ")}`);
  }

  for (const { name, keys } of result.missing) {
    deps.log(`warning: ${name} misses secrets to set in Coolify: ${keys.join(", ")}`);
  }

  for (const { name, keys } of result.unknown) {
    deps.log(
      `${name}: values unreadable without read:sensitive, --apply rewrites ${keys.join(", ")}`,
    );
  }

  if (!options.apply) {
    deps.log(`dry run, ${result.changes.length} change(s), pass --apply to write`);

    return result;
  }

  for (const app of desired) {
    const existing = findApp(remote, app.name, options.environment);
    const changed = result.changes.some((change) => change.name === app.name);

    if (existing && !changed) {
      await deps.client.setEnv(existing.uuid, stateOf(app).env);
      continue;
    }

    await deps.client.upsertApplication(
      app,
      existing
        ? { kind: "update", remote: existing }
        : { kind: "create", environmentName: options.environment, ...deps.placement },
    );
  }

  return result;
}

export function parseArgs(argv: readonly string[]): ApplyOptions {
  const environment = argument(argv, "--environment");
  const owner = argument(argv, "--owner");

  if (!isEnvironment(environment) || !owner) {
    throw new Error(USAGE);
  }

  return { environment, owner: owner.toLowerCase(), apply: argv.includes("--apply") };
}

if (import.meta.main) {
  const options = parseArgs(process.argv.slice(2));

  await runApply(options, {
    client: new CoolifyClient(required("COOLIFY_API_URL"), required("COOLIFY_APPLY_TOKEN")),
    placement: {
      projectUuid: required("COOLIFY_PROJECT_UUID"),
      serverUuid: required("COOLIFY_SERVER_UUID"),
    },
    log: (line) => process.stdout.write(`${line}\n`),
  });
}

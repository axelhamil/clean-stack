import { sleep } from "./cli";
import {
  type AppState,
  type CoolifyApp,
  parseDigestRef,
  type ScheduledTask,
  stateOf,
} from "./services";

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const ENDPOINTS = {
  environment: (projectUuid: string, name: string) => `/api/v1/projects/${projectUuid}/${name}`,
  applications: "/api/v1/applications",
  createDockerImage: "/api/v1/applications/dockerimage",
  application: (uuid: string) => `/api/v1/applications/${uuid}`,
  envs: (uuid: string) => `/api/v1/applications/${uuid}/envs`,
  envsBulk: (uuid: string) => `/api/v1/applications/${uuid}/envs/bulk`,
  tasks: (uuid: string) => `/api/v1/applications/${uuid}/scheduled-tasks`,
  task: (uuid: string, taskUuid: string) =>
    `/api/v1/applications/${uuid}/scheduled-tasks/${taskUuid}`,
  executions: (uuid: string, taskUuid: string) =>
    `/api/v1/applications/${uuid}/scheduled-tasks/${taskUuid}/executions`,
  deploy: "/api/v1/deploy",
  deployment: (id: string) => `/api/v1/deployments/${id}`,
};

const FINISHED = "finished";
const FAILED = new Set(["failed", "cancelled", "cancelled-by-user", "error"]);
const RUNNING = "running";
const STALE_MARGIN_MS = 5 * 60_000;
const UNKNOWN_TASK_TIMEOUT_SECONDS = 3_600;
const BODY_SLICE = 200;
const POLL_RETRIES = 3;
const DEFAULTS = { timeoutMs: 10_000, retryDelayMs: 1_000 };

class CoolifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isTransient(error: unknown): boolean {
  return !(error instanceof CoolifyError) || error.status >= 500;
}

interface RemoteTask extends ScheduledTask {
  uuid: string;
}

export interface AppSummary {
  uuid: string;
  name: string;
}

export interface RemoteApp extends AppSummary {
  image: string;
  port: string;
  healthCheck: string;
  stopGraceSeconds: number;
  env: Map<string, string | undefined>;
  tasks: RemoteTask[];
}

interface ClientOptions {
  timeoutMs?: number;
  retryDelayMs?: number;
}

interface WaitOptions {
  timeoutMs: number;
  pollMs: number;
}

export interface Snapshot {
  image: string;
  imageName: string;
  imageTag: string;
  env: Record<string, string | undefined>;
}

export interface Placement {
  projectUuid: string;
  serverUuid: string;
}

type ApplicationTarget =
  | ({ kind: "create"; environmentName: string } & Placement)
  | { kind: "update"; remote: RemoteApp };

type Json = Record<string, unknown>;

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(source: Json, key: string): string {
  const value = source[key];

  if (typeof value === "string") {
    return value;
  }

  return typeof value === "number" ? String(value) : "";
}

function readable(source: Json): string | undefined {
  return typeof source.value === "string" ? source.value : undefined;
}

function isStale(execution: Json, timeoutSeconds: number, now: number): boolean {
  const startedAt = Date.parse(text(execution, "created_at"));

  return Number.isFinite(startedAt) && now - startedAt > timeoutSeconds * 1_000 + STALE_MARGIN_MS;
}

function latest(executions: readonly Json[]): Json | undefined {
  return executions.reduce<Json | undefined>((newest, execution) => {
    const startedAt = Date.parse(text(execution, "created_at"));
    const newestAt = newest ? Date.parse(text(newest, "created_at")) : Number.NaN;

    return newest === undefined || startedAt > newestAt ? execution : newest;
  }, undefined);
}

function count(source: Json, key: string): number {
  const value = Number(source[key]);

  return Number.isFinite(value) ? value : 0;
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isJson) : [];
}

function remoteTask(source: Json): RemoteTask {
  return {
    uuid: text(source, "uuid"),
    name: text(source, "name"),
    command: text(source, "command"),
    schedule: text(source, "frequency"),
    timeoutSeconds: count(source, "timeout"),
    enabled: source.enabled === true,
  };
}

function taskBody(task: ScheduledTask) {
  return {
    name: task.name,
    command: task.command,
    frequency: task.schedule,
    timeout: task.timeoutSeconds,
    enabled: task.enabled,
  };
}

function applicationBody(state: AppState) {
  return {
    name: state.name,
    docker_registry_image_name: state.image,
    ports_exposes: state.port,
    health_check_enabled: true,
    health_check_command: state.healthCheck,
    stop_grace_period: state.stopGraceSeconds,
  };
}

function envData(values: Record<string, string>) {
  return { data: Object.entries(values).map(([key, value]) => ({ key, value })) };
}

export class CoolifyClient {
  private readonly options: Required<ClientOptions>;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchFn: FetchFn = fetch,
    options: ClientOptions = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  async environmentId(projectUuid: string, name: string): Promise<string> {
    const answer = await this.call("GET", ENDPOINTS.environment(projectUuid, name));
    const id = isJson(answer) ? text(answer, "id") : "";

    if (id === "") {
      throw new Error(`coolify answered no environment ${name} in project ${projectUuid}`);
    }

    return id;
  }

  async listApplicationSummaries(environmentId: string): Promise<AppSummary[]> {
    const applications = await this.applicationsIn(environmentId);

    return applications.map((application) => ({
      uuid: text(application, "uuid"),
      name: text(application, "name"),
    }));
  }

  async listApplications(environmentId: string): Promise<RemoteApp[]> {
    const applications = await this.applicationsIn(environmentId);

    return Promise.all(
      applications.map(async (application) => {
        const uuid = text(application, "uuid");
        const [envs, tasks] = await Promise.all([
          this.call("GET", ENDPOINTS.envs(uuid)),
          this.call("GET", ENDPOINTS.tasks(uuid)),
        ]);

        return {
          uuid,
          name: text(application, "name"),
          image: text(application, "docker_registry_image_name"),
          port: text(application, "ports_exposes"),
          healthCheck: text(application, "health_check_command"),
          stopGraceSeconds: count(application, "stop_grace_period"),
          env: new Map(
            list(envs)
              .filter((env) => env.is_preview !== true)
              .map((env) => [text(env, "key"), readable(env)]),
          ),
          tasks: list(tasks).map(remoteTask),
        };
      }),
    );
  }

  async runningTasks(uuid: string, names: readonly string[]): Promise<string[]> {
    const tasks = list(await this.call("GET", ENDPOINTS.tasks(uuid))).filter((task) =>
      names.includes(text(task, "name")),
    );
    const running = await Promise.all(
      tasks.map(async (task) => {
        const executions = list(
          await this.call("GET", ENDPOINTS.executions(uuid, text(task, "uuid"))),
        );
        const newest = latest(executions);
        const timeoutSeconds = count(task, "timeout") || UNKNOWN_TASK_TIMEOUT_SECONDS;

        return newest !== undefined &&
          text(newest, "status") === RUNNING &&
          !isStale(newest, timeoutSeconds, Date.now())
          ? [text(task, "name")]
          : [];
      }),
    );

    return running.flat();
  }

  async snapshot(uuid: string, keys: readonly string[]): Promise<Snapshot> {
    const [application, envs] = await Promise.all([
      this.call("GET", ENDPOINTS.application(uuid)),
      this.call("GET", ENDPOINTS.envs(uuid)),
    ]);
    const imageName = isJson(application) ? text(application, "docker_registry_image_name") : "";
    const imageTag = isJson(application) ? text(application, "docker_registry_image_tag") : "";
    const values = list(envs).filter((env) => env.is_preview !== true);

    return {
      image: imageTag.startsWith("sha256:")
        ? `${imageName}@${imageTag}`
        : `${imageName}:${imageTag}`,
      imageName,
      imageTag,
      env: Object.fromEntries(
        keys.map((key) => [key, readable(values.find((env) => text(env, "key") === key) ?? {})]),
      ),
    };
  }

  async restore(uuid: string, snapshot: Snapshot): Promise<void> {
    await this.call("PATCH", ENDPOINTS.application(uuid), {
      docker_registry_image_name: snapshot.imageName,
      docker_registry_image_tag: snapshot.imageTag,
    });

    const known = Object.entries(snapshot.env).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, value]],
    );

    await this.setEnv(uuid, Object.fromEntries(known));
  }

  async upsertApplication(app: CoolifyApp, target: ApplicationTarget): Promise<void> {
    const state = stateOf(app);
    const uuid = await this.saveApplication(state, target);

    await this.setEnv(uuid, state.env);

    const remoteTasks = target.kind === "update" ? target.remote.tasks : [];

    for (const task of state.tasks) {
      const existing = remoteTasks.find((remote) => remote.name === task.name);

      if (existing) {
        await this.call("PATCH", ENDPOINTS.task(uuid, existing.uuid), taskBody(task));
        continue;
      }

      await this.call("POST", ENDPOINTS.tasks(uuid), taskBody(task));
    }
  }

  async setEnv(uuid: string, values: Record<string, string>): Promise<void> {
    if (Object.keys(values).length === 0) {
      return;
    }

    await this.call("PATCH", ENDPOINTS.envsBulk(uuid), envData(values));
  }

  async deploy(uuid: string, image: string): Promise<string> {
    const [repository, digest] = parseDigestRef(image).ref.split("@");

    await this.call("PATCH", ENDPOINTS.application(uuid), {
      docker_registry_image_name: repository,
      docker_registry_image_tag: digest,
    });

    const answer = await this.call(
      "POST",
      `${ENDPOINTS.deploy}?${new URLSearchParams({ uuid, force: "false" })}`,
    );
    const id = list(isJson(answer) ? answer.deployments : undefined)
      .map((deployment) => text(deployment, "deployment_uuid"))
      .find((value) => value !== "");

    if (!id) {
      throw new Error(`coolify answered no deployment id for application ${uuid}`);
    }

    return id;
  }

  async waitForDeployment(id: string, options: WaitOptions): Promise<void> {
    const deadline = Date.now() + options.timeoutMs;

    while (Date.now() <= deadline) {
      const answer = await this.pollDeployment(id);
      const status = isJson(answer) ? text(answer, "status") : "";

      if (status === FINISHED) {
        return;
      }

      if (FAILED.has(status)) {
        throw new Error(`deployment ${id} ended with status ${status}`);
      }

      await sleep(Math.max(0, Math.min(options.pollMs, deadline - Date.now())));
    }

    throw new Error(`deployment ${id} timed out after ${options.timeoutMs} ms`);
  }

  private async applicationsIn(environmentId: string): Promise<Json[]> {
    const applications = list(await this.call("GET", ENDPOINTS.applications));

    return applications.filter(
      (application) => text(application, "environment_id") === environmentId,
    );
  }

  private async pollDeployment(id: string): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.call("GET", ENDPOINTS.deployment(id));
      } catch (error) {
        if (attempt >= POLL_RETRIES || !isTransient(error)) {
          throw error;
        }

        await sleep(this.options.retryDelayMs * 2 ** attempt);
      }
    }
  }

  private async saveApplication(state: AppState, target: ApplicationTarget): Promise<string> {
    if (target.kind === "update") {
      await this.call("PATCH", ENDPOINTS.application(target.remote.uuid), applicationBody(state));

      return target.remote.uuid;
    }

    const created = await this.call("POST", ENDPOINTS.createDockerImage, {
      ...applicationBody(state),
      project_uuid: target.projectUuid,
      server_uuid: target.serverUuid,
      environment_name: target.environmentName,
      instant_deploy: false,
    });
    const uuid = isJson(created) ? text(created, "uuid") : "";

    if (uuid === "") {
      throw new Error(`coolify answered no uuid for the new application ${state.name}`);
    }

    return uuid;
  }

  private async call(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });

    const route = `coolify ${method} ${path.split("?")[0]} answered ${response.status}`;

    if (!response.ok) {
      throw new CoolifyError(route, response.status);
    }

    const answer = await response.text();

    if (answer.trim() === "") {
      return undefined;
    }

    try {
      return JSON.parse(answer);
    } catch {
      const quote = path.includes("/envs") ? "" : `: ${answer.slice(0, BODY_SLICE)}`;

      throw new CoolifyError(`${route} with a body that is not JSON${quote}`, response.status);
    }
  }
}

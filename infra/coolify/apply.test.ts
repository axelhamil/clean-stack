import { describe, expect, it, mock } from "bun:test";
import { parseArgs, plan, runApply } from "./apply";
import { CoolifyClient, type FetchFn, type RemoteApp } from "./client";
import { type CoolifyApp, servicesFor, stateOf } from "./services";

const OWNER = "acme";
const desired = servicesFor("staging", OWNER);
const placement = { projectUuid: "project", serverUuid: "server" };

function remoteOf(app: CoolifyApp, uuid: string): RemoteApp {
  const state = stateOf(app);
  const secrets = state.secrets.map((key): [string, string] => [key, "operator value"]);

  return {
    uuid,
    name: state.name,
    image: state.image,
    port: state.port,
    healthCheck: state.healthCheck,
    stopGraceSeconds: state.stopGraceSeconds,
    env: new Map([...secrets, ...Object.entries(state.env)]),
    tasks: state.tasks.map((task) => ({ ...task, uuid: `${uuid}-${task.name}` })),
  };
}

const inSync = desired.map((app) => remoteOf(app, `uuid-${app.name}`));

function withApiEnv(edit: (env: Map<string, string | undefined>) => void): RemoteApp[] {
  return inSync.map((app) => {
    if (app.name !== "api") {
      return app;
    }

    const env = new Map(app.env);
    edit(env);

    return { ...app, env };
  });
}

function recordingCoolify(remote: RemoteApp[]) {
  const calls: { method: string; path: string; body: string }[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    const path = url.replace("https://coolify.test", "");
    const method = init.method ?? "GET";
    calls.push({ method, path, body: typeof init.body === "string" ? init.body : "" });
    const app = remote.find((candidate) =>
      path.startsWith(`/api/v1/applications/${candidate.uuid}/`),
    );

    if (path === "/api/v1/projects/project/staging") {
      return Response.json({ id: 1 });
    }

    if (path === "/api/v1/applications") {
      return Response.json(
        remote.map((candidate) => ({
          uuid: candidate.uuid,
          name: candidate.name,
          environment_id: 1,
          docker_registry_image_name: candidate.image,
          ports_exposes: candidate.port,
          health_check_command: candidate.healthCheck,
          stop_grace_period: candidate.stopGraceSeconds,
        })),
      );
    }

    if (path === "/api/v1/applications/dockerimage") {
      return Response.json({ uuid: "created" });
    }

    if (app && method === "GET" && path.endsWith("/envs")) {
      return Response.json([...app.env.keys()].map((key) => ({ key, is_preview: false })));
    }

    if (app && method === "GET" && path.endsWith("/scheduled-tasks")) {
      return Response.json(
        app.tasks.map((task) => ({
          uuid: task.uuid,
          name: task.name,
          command: task.command,
          frequency: task.schedule,
          timeout: task.timeoutSeconds,
          enabled: task.enabled,
        })),
      );
    }

    return Response.json(method === "GET" ? [] : {});
  };

  return { calls, client: new CoolifyClient("https://coolify.test", "token", fetchFn) };
}

describe("plan", () => {
  it("plans nothing when the remote equals the desired state", () => {
    expect(plan(desired, inSync, "staging")).toEqual({ changes: [], missing: [], unknown: [] });
  });

  it("plans a create for an app the remote lacks and reports all its secrets as missing", () => {
    const remote = inSync.filter((app) => app.name !== "admin");

    const result = plan(desired, remote, "staging");

    expect(result.changes.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: "create", name: "admin" },
    ]);
    expect(result.missing).toEqual([
      { name: "admin", keys: ["VITE_API_URL", "CSP_CONNECT_EXTRA"] },
    ]);
  });

  it("plans an update listing only the differing fields, whatever extra key the remote holds", () => {
    const remote = withApiEnv((env) => {
      env.set("NODE_ENV", "development");
      env.set("AUTH_COOKIE_DOMAIN", "example.com");
    }).map((app) => (app.name === "api" ? { ...app, stopGraceSeconds: 10 } : app));

    expect(plan(desired, remote, "staging").changes).toEqual([
      { kind: "update", name: "api", fields: ["stopGraceSeconds", "env.NODE_ENV"] },
    ]);
  });

  it.each([
    ["absent", (env: Map<string, string | undefined>) => env.delete("STRIPE_SECRET_KEY")],
    ["empty", (env: Map<string, string | undefined>) => env.set("STRIPE_SECRET_KEY", "")],
  ])("reports a secret %s in Coolify without planning to write it", (_case, edit) => {
    expect(plan(desired, withApiEnv(edit), "staging")).toEqual({
      changes: [],
      missing: [{ name: "api", keys: ["STRIPE_SECRET_KEY"] }],
      unknown: [],
    });
  });

  it("plans a literal only when its key is absent or its readable value differs", () => {
    const remote = withApiEnv((env) => {
      env.delete("PORT");
      env.set("NODE_ENV", undefined);
    });

    expect(plan(desired, remote, "staging")).toEqual({
      changes: [{ kind: "update", name: "api", fields: ["env.PORT"] }],
      missing: [],
      unknown: [{ name: "api", keys: ["NODE_ENV"] }],
    });
  });

  it("plans a task update when the sweep schedule drifts", () => {
    const remote = inSync.map((app) =>
      app.name === "api"
        ? {
            ...app,
            tasks: app.tasks.map((task) =>
              task.name === "sweep" ? { ...task, schedule: "0 * * * *" } : task,
            ),
          }
        : app,
    );

    expect(plan(desired, remote, "staging").changes).toEqual([
      { kind: "update", name: "api", fields: ["task.sweep"] },
    ]);
  });
});

describe("runApply", () => {
  it("is a dry run unless --apply is given", async () => {
    const client = {
      environmentId: mock(async () => "1"),
      listApplications: mock(async () => []),
      upsertApplication: mock(async () => {}),
      setEnv: mock(async () => {}),
    };
    const options = parseArgs(["--environment", "staging", "--owner", "Acme"]);

    await runApply(options, { client, placement, log: () => {} });
    const writesOfDryRun = client.upsertApplication.mock.calls.length;
    await runApply({ ...options, apply: true }, { client, placement, log: () => {} });

    expect(options).toEqual({ environment: "staging", owner: "acme", apply: false });
    expect(writesOfDryRun).toBe(0);
    expect(client.upsertApplication).toHaveBeenCalledTimes(desired.length);
  });

  it("reads hidden values as unknown, reports nothing missing and rewrites every literal on --apply", async () => {
    const { calls, client } = recordingCoolify(inSync);
    const lines: string[] = [];
    const api = desired.find((app) => app.name === "api");

    if (!api) {
      throw new Error("servicesFor lost the api app");
    }

    const result = await runApply(
      { environment: "staging", owner: OWNER, apply: true },
      { client, placement, log: (line) => lines.push(line) },
    );

    expect(result.changes).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.unknown).toEqual([{ name: "api", keys: Object.keys(stateOf(api).env) }]);
    expect(calls.filter((call) => call.method !== "GET").map((call) => call.path)).toEqual([
      "/api/v1/applications/uuid-api/envs/bulk",
    ]);
  });

  it("never deletes and never sends a secret value, even with a stranger app in Coolify", async () => {
    const api = desired.find((app) => app.name === "api");

    if (!api) {
      throw new Error("servicesFor lost the api app");
    }

    const stranger = { ...remoteOf(api, "stranger"), name: "metabase" };
    const { calls, client } = recordingCoolify([stranger]);
    const secretKeys = desired.flatMap((app) => stateOf(app).secrets);

    await runApply(
      { environment: "staging", owner: OWNER, apply: true },
      { client, placement, log: () => {} },
    );

    const writes = calls.filter((call) => call.method !== "GET");

    expect(writes.length).toBeGreaterThan(0);
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    expect(writes.some((call) => call.path.includes("stranger"))).toBe(false);
    for (const key of secretKeys) {
      expect(writes.some((call) => call.body.includes(`"${key}"`))).toBe(false);
    }
  });
});

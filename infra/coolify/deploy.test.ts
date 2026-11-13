import { describe, expect, it } from "bun:test";
import { CoolifyClient, type FetchFn } from "./client";
import { type DeployOptions, parseArgs, runDeploy } from "./deploy";

const OWNER = "acme";
const RELEASE = "b".repeat(40);
const PREVIOUS_RELEASE = "e".repeat(40);
const PREVIOUS_TAG = `sha256:${"0".repeat(64)}`;
const ref = (name: string, hex: string) =>
  `ghcr.io/${OWNER}/clean-stack-${name}@sha256:${hex.repeat(64)}`;
const previousOf = (name: string) => `ghcr.io/${OWNER}/clean-stack-${name}@${PREVIOUS_TAG}`;
const API = ref("api", "a");
const APP = ref("app", "c");
const ADMIN = ref("admin", "d");
const ENVIRONMENT_IDS = new Map([
  ["staging", 1],
  ["production", 2],
]);
const FAST = { timeoutMs: 20, pollMs: 1 };
const SWEEP_TIMEOUT_SECONDS = 1_800;

interface Execution {
  status: string;
  created_at: string;
}

interface FakeApp {
  uuid: string;
  name: string;
  environment_id: number;
  tasks?: { name: string; executions: Execution[][] }[];
}

interface FakeOptions {
  failing?: string;
  failingStatus?: string;
  hiddenRelease?: boolean;
  restoreFails?: boolean;
}

const execution = (status: string, ageMs = 0): Execution => ({
  status,
  created_at: new Date(Date.now() - ageMs).toISOString(),
});

function stagingAndProduction(): FakeApp[] {
  return ["api", "app", "admin"].flatMap((name) => [
    { uuid: `staging-${name}`, name, environment_id: 1 },
    { uuid: `production-${name}`, name, environment_id: 2 },
  ]);
}

function withTask(name: string, executions: Execution[][]): FakeApp[] {
  return stagingAndProduction().map((app) =>
    app.uuid === "staging-api" ? { ...app, tasks: [{ name, executions }] } : app,
  );
}

const withSweep = (executions: Execution[][]) => withTask("sweep", executions);

function answerFor(apps: FakeApp[], fake: FakeOptions) {
  const reads = new Map<string, number>();
  const started = new Set<string>();

  return (method: string, path: string): Response => {
    const environment = path.match(/^\/api\/v1\/projects\/project\/(\w+)$/);
    const environmentId = ENVIRONMENT_IDS.get(environment?.[1] ?? "");

    if (environmentId !== undefined) {
      return Response.json({ id: environmentId });
    }

    if (path === "/api/v1/applications") {
      return Response.json(
        apps.map(({ uuid, name, environment_id }) => ({ uuid, name, environment_id })),
      );
    }

    const application = path.match(/^\/api\/v1\/applications\/([\w-]+)$/);
    const app = apps.find((candidate) => candidate.uuid === application?.[1]);

    if (app && method === "GET") {
      return Response.json({
        uuid: app.uuid,
        docker_registry_image_name: `ghcr.io/${OWNER}/clean-stack-${app.name}`,
        docker_registry_image_tag: PREVIOUS_TAG,
      });
    }

    if (app && method === "PATCH" && fake.restoreFails && started.has(app.uuid)) {
      return new Response("", { status: 500 });
    }

    if (/^\/api\/v1\/applications\/[\w-]+\/envs$/.test(path)) {
      return Response.json([
        fake.hiddenRelease ? { key: "GIT_SHA" } : { key: "GIT_SHA", value: PREVIOUS_RELEASE },
        { key: "DATABASE_URL" },
      ]);
    }

    const tasks = path.match(/^\/api\/v1\/applications\/([\w-]+)\/scheduled-tasks$/);

    if (tasks) {
      const owner = apps.find((candidate) => candidate.uuid === tasks[1]);

      return Response.json(
        (owner?.tasks ?? []).map((task) => ({
          uuid: `${owner?.uuid}-${task.name}`,
          name: task.name,
          timeout: SWEEP_TIMEOUT_SECONDS,
        })),
      );
    }

    const executions = path.match(
      /^\/api\/v1\/applications\/([\w-]+)\/scheduled-tasks\/([\w-]+)\/executions$/,
    );

    if (executions) {
      const owner = apps.find((candidate) => candidate.uuid === executions[1]);
      const task = owner?.tasks?.find(
        (candidate) => `${owner.uuid}-${candidate.name}` === executions[2],
      );
      const seen = reads.get(path) ?? 0;
      reads.set(path, seen + 1);
      const history = task?.executions ?? [];

      return Response.json(history[Math.min(seen, history.length - 1)] ?? []);
    }

    if (path.startsWith("/api/v1/deploy?")) {
      const uuid = new URL(`https://x${path}`).searchParams.get("uuid") ?? "";
      started.add(uuid);

      return Response.json({ deployments: [{ deployment_uuid: `d-${uuid}` }] });
    }

    const deployment = path.match(/^\/api\/v1\/deployments\/d-([\w-]+)$/);

    if (deployment) {
      return Response.json({
        status: deployment[1] === fake.failing ? (fake.failingStatus ?? "failed") : "finished",
      });
    }

    if (method === "PATCH") {
      return Response.json({});
    }

    return new Response("", { status: 404 });
  };
}

function fakeCoolify(apps: FakeApp[], fake: FakeOptions = {}) {
  const calls: { method: string; path: string; body: string }[] = [];
  const answer = answerFor(apps, fake);
  const fetchFn: FetchFn = async (url, init) => {
    const path = url.replace("https://coolify.test", "");
    const method = init.method ?? "GET";
    calls.push({ method, path, body: typeof init.body === "string" ? init.body : "" });

    return answer(method, path);
  };
  const lines: string[] = [];

  return {
    calls,
    lines,
    deploys: () =>
      calls.filter((call) => call.path.startsWith("/api/v1/deploy?")).map((call) => call.path),
    lastBody: (method: string, path: string): unknown =>
      JSON.parse(
        calls.findLast((call) => call.method === method && call.path === path)?.body ?? "{}",
      ),
    deps: {
      client: new CoolifyClient("https://coolify.test", "token", fetchFn),
      projectUuid: "project",
      log: (line: string) => lines.push(line),
    },
  };
}

const argvOf = (digests: Record<string, string>) => [
  "--environment",
  "staging",
  "--owner",
  "Acme",
  "--release",
  RELEASE,
  ...Object.entries(digests).flatMap(([name, digest]) => [`--${name}`, digest]),
];

const options = (digests: Record<string, string>): DeployOptions => parseArgs(argvOf(digests));

const ALL = options({ api: API, app: APP, admin: ADMIN });

describe("deploy", () => {
  it("deploys api, app then admin, only in the target environment, writing the release", async () => {
    const { calls, deploys, lastBody, deps } = fakeCoolify(stagingAndProduction());

    await runDeploy(ALL, deps);

    expect(deploys()).toEqual([
      "/api/v1/deploy?uuid=staging-api&force=false",
      "/api/v1/deploy?uuid=staging-app&force=false",
      "/api/v1/deploy?uuid=staging-admin&force=false",
    ]);
    expect(lastBody("PATCH", "/api/v1/applications/staging-api/envs/bulk")).toEqual({
      data: [{ key: "GIT_SHA", value: RELEASE }],
    });
    expect(calls.filter((call) => call.path.includes("production-"))).toEqual([]);
  });

  it("refuses when two apps of the environment carry the same name, before any write", async () => {
    const apps = [
      ...stagingAndProduction(),
      { uuid: "staging-api-copy", name: "api", environment_id: 1 },
    ];
    const { calls, deps } = fakeCoolify(apps);

    await expect(runDeploy(ALL, deps)).rejects.toThrow(/several applications named api/);
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("restores the previous image and release of a failed app and stops there", async () => {
    const { deploys, lastBody, lines, deps } = fakeCoolify(stagingAndProduction(), {
      failing: "staging-api",
    });

    await expect(runDeploy(ALL, deps)).rejects.toThrow(/failed/);

    expect(deploys()).toEqual(["/api/v1/deploy?uuid=staging-api&force=false"]);
    expect(lastBody("PATCH", "/api/v1/applications/staging-api")).toEqual({
      docker_registry_image_name: `ghcr.io/${OWNER}/clean-stack-api`,
      docker_registry_image_tag: PREVIOUS_TAG,
    });
    expect(lastBody("PATCH", "/api/v1/applications/staging-api/envs/bulk")).toEqual({
      data: [{ key: "GIT_SHA", value: PREVIOUS_RELEASE }],
    });
    expect(lines.slice(-3)).toEqual([
      `api: deployment failed, restored to ${previousOf("api")}`,
      "app: not deployed, left on its previous image",
      "admin: not deployed, left on its previous image",
    ]);
  });

  it("says so when the previous release of a failed app cannot be read back", async () => {
    const { lines, deps } = fakeCoolify(stagingAndProduction(), {
      failing: "staging-api",
      hiddenRelease: true,
    });

    await expect(runDeploy(ALL, deps)).rejects.toThrow(/failed/);

    expect(lines).toContain(
      `api: deployment failed, restored to ${previousOf("api")}, its previous GIT_SHA is unreadable so it stays ${RELEASE}`,
    );
  });

  it("fails loudly when the restore of a failed app fails too", async () => {
    const { lines, deps } = fakeCoolify(stagingAndProduction(), {
      failing: "staging-app",
      restoreFails: true,
    });

    await expect(runDeploy(ALL, deps)).rejects.toThrow(/restore failed/);

    expect(lines.some((line) => line.startsWith("app: deployment failed and restore failed"))).toBe(
      true,
    );
  });

  it("bounds the whole run by its time budget and reports a deployment still running", async () => {
    const { deploys, lines, deps } = fakeCoolify(stagingAndProduction(), {
      failing: "staging-app",
      failingStatus: "in_progress",
    });

    await expect(runDeploy({ ...ALL, budgetMs: 200 }, deps)).rejects.toThrow(/timed out/);

    expect(deploys()).not.toContain("/api/v1/deploy?uuid=staging-admin&force=false");
    expect(lines.slice(-2)).toEqual([
      `app: still running in Coolify after the wait, config restored to ${previousOf("app")}`,
      "admin: not deployed, left on its previous image",
    ]);
  });

  it.each(["sweep", "rgpd-sweep"])(
    "waits for a running %s to end before deploying the api",
    async (task) => {
      const { deploys, deps } = fakeCoolify(
        withTask(task, [[execution("running")], [execution("success")]]),
      );

      await runDeploy(
        { ...options({ api: API }), taskWait: { timeoutMs: 1_000, pollMs: 1 } },
        deps,
      );

      expect(deploys()).toContain("/api/v1/deploy?uuid=staging-api&force=false");
    },
  );

  it.each([
    [
      "an older execution still marked running",
      [execution("success"), execution("running", 60_000)],
    ],
    [
      "a latest execution running past its timeout",
      [execution("running", (SWEEP_TIMEOUT_SECONDS + 6 * 60) * 1_000)],
    ],
  ])("deploys the api at once despite %s", async (_case, executions) => {
    const { deploys, deps } = fakeCoolify(withSweep([executions]));

    await runDeploy({ ...options({ api: API }), taskWait: FAST }, deps);

    expect(deploys()).toEqual(["/api/v1/deploy?uuid=staging-api&force=false"]);
  });

  it("deploys the api at once while the notification email flush runs", async () => {
    const { deploys, deps } = fakeCoolify(
      withTask("flush-notification-emails", [[execution("running")]]),
    );

    await runDeploy({ ...options({ api: API }), taskWait: FAST }, deps);

    expect(deploys()).toEqual(["/api/v1/deploy?uuid=staging-api&force=false"]);
  });

  it("skips the api while its sweep still runs and deploys nothing after it", async () => {
    const { deploys, lines, deps } = fakeCoolify(withSweep([[execution("running")]]));

    await expect(runDeploy({ ...ALL, taskWait: FAST }, deps)).rejects.toThrow(/api skipped/);

    expect(deploys()).toEqual([]);
    expect(lines).toEqual([
      "warning: api skipped, its task sweep still runs, redeploy it once the task ends",
      "api: skipped, left on its previous image",
      "app: not deployed, left on its previous image",
      "admin: not deployed, left on its previous image",
    ]);
  });

  it("refuses a release that is not a full commit sha", async () => {
    const { calls, deps } = fakeCoolify(stagingAndProduction());

    await expect(runDeploy({ ...ALL, release: "b".repeat(7) }, deps)).rejects.toThrow(
      /full commit sha/,
    );
    expect(calls).toEqual([]);
  });

  it.each([
    [{ api: API.replace(OWNER, "intruder") }],
    [{ app: API }],
    [{ api: `ghcr.io/${OWNER}/clean-stack-api:sha-1` }],
    [{}],
  ])("refuses the digests %j", (digests) => {
    expect(() => parseArgs(argvOf(digests))).toThrow();
  });
});

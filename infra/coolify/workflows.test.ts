import { describe, expect, it } from "bun:test";
import { type Job, textOf, workflowOf } from "../test-support";
import { DEPLOY_BUDGET_MINUTES } from "./deploy";

const CI = ".github/workflows/ci.yml";
const DEPLOY = ".github/workflows/deploy.yml";
const ROLLBACK = ".github/workflows/rollback.yml";
const RUN = "github.event.workflow_run";
const expression = (body: string) => `\${{ ${body} }}`;
const PRODUCTION_ON_MAIN = expression(`${RUN}.head_branch == 'main' && 'production' || 'staging'`);
const HEAD_SHA = expression(`${RUN}.head_sha`);
const DEPLOY_GUARD = [
  `${RUN}.conclusion == 'success'`,
  `${RUN}.event == 'push'`,
  `${RUN}.head_repository.full_name == github.repository`,
  "vars.COOLIFY_DEPLOY == 'on'",
].join(" && ");
const DEPLOY_CALL = "infra/coolify/deploy.ts";
const GATES_CALL = "infra/coolify/gates.ts";
const BUILD_ACTION = "docker/build-push-action@";
const SETUP_AND_GATES_MINUTES = 10;
const POSTGRES_DOCKERFILE = "infra/docker/postgres-pgbackrest.Dockerfile";

function jobWith(jobs: Record<string, Job>, script: string): Job {
  const job = Object.values(jobs).find((candidate) =>
    candidate.steps.some((step) => step.run?.includes(script)),
  );

  if (!job) {
    throw new Error(`no job runs ${script}`);
  }

  return job;
}

describe("the coolify deploy and rollback workflows", () => {
  it("deploys only after a completed CI run on a push to dev or main", async () => {
    const ci = await workflowOf(CI);
    const deploy = await workflowOf(DEPLOY);

    expect(ci.on.push?.branches).toEqual(expect.arrayContaining(["dev", "main"]));
    expect(deploy.on.push).toBeUndefined();
    expect(deploy.on.workflow_run).toEqual({
      workflows: [ci.name],
      types: ["completed"],
      branches: ["dev", "main"],
    });
  });

  it("builds nothing unless CI succeeded on a push of this repository and COOLIFY_DEPLOY is on", async () => {
    const { jobs } = await workflowOf(DEPLOY);

    expect(jobs.build?.if).toBe(DEPLOY_GUARD);
    expect(jobWith(jobs, DEPLOY_CALL).needs).toBe("build");
  });

  it("checks out, tags and releases the commit CI tested, never github.sha", async () => {
    const text = await textOf(DEPLOY);
    const { jobs } = await workflowOf(DEPLOY);
    const checkouts = Object.values(jobs).flatMap((job) =>
      job.steps.filter((step) => step.uses?.startsWith("actions/checkout@")),
    );
    const deployJob = jobWith(jobs, DEPLOY_CALL);

    expect(text).not.toContain("github.sha");
    expect(text).not.toContain("GITHUB_SHA");
    expect(checkouts).toHaveLength(Object.keys(jobs).length);
    for (const checkout of checkouts) {
      expect(checkout.with).toEqual({ ref: HEAD_SHA });
    }
    expect(text).toContain(`sha-${HEAD_SHA}`);
    expect(deployJob.env?.RELEASE_SHA).toBe(HEAD_SHA);
    expect(deployJob.steps.find((step) => step.run?.includes(DEPLOY_CALL))?.run).toContain(
      '--release "$RELEASE_SHA"',
    );
  });

  it("deploys to production only from main", async () => {
    const deploy = await workflowOf(DEPLOY);
    const rollback = await workflowOf(ROLLBACK);
    const deployJob = jobWith(deploy.jobs, DEPLOY_CALL);
    const rollbackJob = jobWith(rollback.jobs, DEPLOY_CALL);

    expect(deployJob.environment).toBe(PRODUCTION_ON_MAIN);
    expect(deployJob.env?.DEPLOY_ENVIRONMENT).toBe(PRODUCTION_ON_MAIN);
    expect(deploy.jobs.build?.environment).toBe(PRODUCTION_ON_MAIN);
    expect(deploy.concurrency).toEqual({
      group: `deploy-${PRODUCTION_ON_MAIN}`,
      "cancel-in-progress": false,
    });
    expect(rollbackJob.needs).toBe("guard");
    expect(rollback.jobs.guard?.steps.map((step) => step.run).join("\n")).toMatch(
      /"\$DEPLOY_ENVIRONMENT" = "production" \][\s\S]*"\$REF_NAME" != "main" \][\s\S]*exit 1/,
    );
    expect(rollback.concurrency).toEqual({
      group: `deploy-${expression("inputs.environment")}`,
      "cancel-in-progress": false,
    });
  });

  it("builds the four images in build only, the only job allowed to write packages", async () => {
    const deploy = await workflowOf(DEPLOY);
    const builds = (deploy.jobs.build?.steps ?? []).filter((step) =>
      step.uses?.startsWith(BUILD_ACTION),
    );
    const writers = Object.entries(deploy.jobs).filter(
      ([, job]) => job.permissions?.packages === "write",
    );

    expect(builds.map((step) => step.with?.file)).toEqual([
      "apps/api/prod.Dockerfile",
      "apps/app/prod.Dockerfile",
      "apps/admin/prod.Dockerfile",
      POSTGRES_DOCKERFILE,
    ]);
    expect(writers.map(([name]) => name)).toEqual(["build"]);
    expect(deploy.permissions).toEqual({ contents: "read" });
  });

  it("bakes every key a single page app reads into its image", async () => {
    const deploy = await workflowOf(DEPLOY);
    const builds = deploy.jobs.build?.steps ?? [];

    for (const app of ["app", "admin"]) {
      const dockerfile = `apps/${app}/prod.Dockerfile`;
      const read = [
        ...(await textOf(`apps/${app}/src/shared/env.ts`)).matchAll(/^\s+(VITE_\w+):/gm),
      ];
      const declared = await textOf(dockerfile);
      const buildArgs = String(
        builds.find((step) => step.with?.file === dockerfile)?.with?.["build-args"],
      );
      const passed = [...buildArgs.matchAll(/^\s*(VITE_\w+)=/gm)].map(([, key]) => key);

      for (const [, key] of read) {
        expect({ app, key, declared: declared.includes(`ARG ${key}\n`) }).toEqual({
          app,
          key,
          declared: true,
        });
        expect({ app, passed }).toEqual({ app, passed: expect.arrayContaining([key]) });
      }
    }
  });

  it("gates every deploy and rollback on the health checks", async () => {
    for (const path of [DEPLOY, ROLLBACK]) {
      const { jobs } = await workflowOf(path);
      const steps = jobWith(jobs, DEPLOY_CALL).steps;
      const deploy = steps.findIndex((step) => step.run?.includes(DEPLOY_CALL));
      const gates = steps.findIndex((step) => step.run?.includes(GATES_CALL));

      expect(gates).toBeGreaterThan(deploy);
    }
  });

  it("rolls back without building nor writing packages", async () => {
    const rollback = await workflowOf(ROLLBACK);
    const text = await textOf(ROLLBACK);

    expect(rollback.on.workflow_dispatch).toBeDefined();
    expect(rollback.permissions).toEqual({ contents: "read" });
    expect(text).not.toContain(BUILD_ACTION);
    for (const job of Object.values(rollback.jobs)) {
      expect(job.permissions?.packages).toBeUndefined();
    }
  });

  it("gives every deploy job the deploy time budget plus its setup and gates", async () => {
    for (const path of [DEPLOY, ROLLBACK]) {
      const { jobs } = await workflowOf(path);

      expect(jobWith(jobs, DEPLOY_CALL)["timeout-minutes"]).toBeGreaterThanOrEqual(
        DEPLOY_BUDGET_MINUTES + SETUP_AND_GATES_MINUTES,
      );
    }
  });
});

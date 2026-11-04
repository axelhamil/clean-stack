import { describe, expect, it } from "bun:test";
import { YAML } from "bun";
import z from "zod";
import { textOf, workflowOf } from "../test-support";

const DOCKERFILE = "infra/docker/postgres-pgbackrest.Dockerfile";
const PGBACKREST_CONF = "infra/pgbackrest/pgbackrest.conf";
const POSTGRES_CONF = "infra/pgbackrest/postgresql.conf";
const DRILL_COMPOSE = "infra/pgbackrest/docker-compose.drill.yaml";
const DRILL_SCRIPT = "infra/pgbackrest/drill.sh";
const DRILL_WORKFLOW = ".github/workflows/pgbackrest-drill.yml";
const RUN_SCRIPT = "infra/vps/pgbackrest-run.sh";
const ENV_EXAMPLE = "infra/vps/pgbackrest.env.example";
const DEV_COMPOSE = "docker-compose.yaml";
const OTHER_WORKFLOWS = ["ci.yml", "deploy.yml", "rollback.yml", "release.yml"].map(
  (name) => `.github/workflows/${name}`,
);
const STANZA = "clean-stack";
const DATA_DIRECTORY = "/var/lib/postgresql/18/docker";
const DRILL_ENVIRONMENT = "pgbackrest-drill";
const SECRET_OPTIONS = ["repo1-cipher-pass", "repo1-s3-key", "repo1-s3-key-secret"];
const SECRET_KEYS = [
  "PGBACKREST_REPO1_CIPHER_PASS",
  "PGBACKREST_REPO1_S3_KEY",
  "PGBACKREST_REPO1_S3_KEY_SECRET",
];
const WRITE_COMMANDS =
  /\b(backup|archive-push|stanza-create|stanza-upgrade|stanza-delete|expire|check)\b/;
const FAIL_ON_ANY_FAILURE = `\${{ job.status != 'success' && '/fail' || '' }}`;

const composeSchema = z.looseObject({
  services: z.record(
    z.string(),
    z.looseObject({
      image: z.string().optional(),
      environment: z.record(z.string(), z.string()).optional(),
    }),
  ),
  networks: z.record(z.string(), z.looseObject({ internal: z.boolean().optional() })).optional(),
});

async function composeOf(path: string) {
  return composeSchema.parse(YAML.parse(await textOf(path)));
}

function sectionsOf(text: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>();
  let current = new Map<string, string>();

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const header = /^\[(.+)\]$/.exec(line)?.[1];

    if (header) {
      current = new Map();
      sections.set(header, current);
      continue;
    }

    const separator = line.indexOf("=");

    if (separator > 0) {
      current.set(line.slice(0, separator), line.slice(separator + 1));
    }
  }

  return sections;
}

async function pgbackrestOption(section: string, key: string): Promise<string | undefined> {
  return sectionsOf(await textOf(PGBACKREST_CONF))
    .get(section)
    ?.get(key);
}

function promotionLoops(script: string): string[] {
  return [...script.matchAll(/^\s*until [^\n]+\n([\s\S]*?)^\s*done$/gm)].map(
    ([, body]) => body ?? "",
  );
}

describe("the postgres image with pgbackrest", () => {
  it("builds from the postgres major of the dev stack pinned by digest", async () => {
    const dockerfile = await textOf(DOCKERFILE);
    const devCompose = await composeOf(DEV_COMPOSE);
    const devMajor = /^postgres:(\d+)/.exec(devCompose.services.postgres?.image ?? "")?.[1];
    const bases = dockerfile.match(/^FROM .+$/gm) ?? [];

    expect(bases).toHaveLength(1);
    expect(bases[0]).toMatch(
      new RegExp(`^FROM postgres:${devMajor}\\.\\d+-trixie@sha256:[0-9a-f]{64}$`),
    );
    expect(await pgbackrestOption(STANZA, "pg1-path")).toBe(DATA_DIRECTORY);
    expect(dockerfile).toContain(`PGDATA=${DATA_DIRECTORY}`);
  });

  it("installs pgbackrest 2.60.0 from the PGDG archive, which keeps every version after a newer one ships", async () => {
    const dockerfile = await textOf(DOCKERFILE);

    expect(dockerfile).toMatch(
      /https:\/\/apt-archive\.postgresql\.org\/pub\/repos\/apt trixie-pgdg-archive main/,
    );
    expect(dockerfile).toMatch(/\bpgbackrest=2\.60\.0-\d+\.pgdg13\+1\b/);
  });

  it("encrypts the repository with aes-256-cbc and reads every secret from the environment", async () => {
    const committed = await Promise.all(
      [DOCKERFILE, PGBACKREST_CONF, POSTGRES_CONF, DRILL_COMPOSE, ENV_EXAMPLE].map(textOf),
    );
    const workflow = await workflowOf(DRILL_WORKFLOW);
    const composed = Object.values((await composeOf(DRILL_COMPOSE)).services).flatMap((service) =>
      Object.entries(service.environment ?? {}).filter(([key]) => SECRET_KEYS.includes(key)),
    );
    const drillEnv = workflow.jobs.drill?.env ?? {};

    expect(await pgbackrestOption("global", "repo1-cipher-type")).toBe("aes-256-cbc");
    for (const text of committed) {
      for (const option of [...SECRET_OPTIONS, ...SECRET_KEYS]) {
        expect(text).not.toMatch(new RegExp(`^\\s*${option}\\s*=`, "m"));
      }
    }
    expect(composed.map(([key]) => key).sort()).toEqual([...SECRET_KEYS].sort());
    for (const [, value] of composed) {
      expect(value).toMatch(/^\$\{[A-Z0-9_]+:\?[^}]*\}$/);
    }
    for (const key of SECRET_KEYS) {
      expect(drillEnv[key]).toBe(`\${{ secrets.${key} }}`);
    }
  });

  it("archives to and backs up the one stanza every script and the drill workflow use", async () => {
    const postgres = await textOf(POSTGRES_CONF);
    const scripts = await Promise.all([DRILL_SCRIPT, RUN_SCRIPT].map(textOf));

    expect(postgres).toContain(`archive_command = 'pgbackrest --stanza=${STANZA} archive-push %p'`);
    expect([...sectionsOf(await textOf(PGBACKREST_CONF)).keys()]).toContain(STANZA);
    for (const script of scripts) {
      expect(script).toMatch(new RegExp(`^STANZA=${STANZA}$`, "m"));
    }
    expect(await textOf(DRILL_WORKFLOW)).toContain(`--stanza=${STANZA}`);
  });
});

describe("the local restore drill", () => {
  it("writes only to a throwaway bucket on its own internal network, never to the production repository", async () => {
    const compose = await composeOf(DRILL_COMPOSE);
    const postgres = compose.services.postgres?.environment ?? {};
    const script = await textOf(DRILL_SCRIPT);

    expect(Object.keys(compose.services)).toContain(postgres.PGBACKREST_REPO1_S3_ENDPOINT ?? "");
    expect(postgres.PGBACKREST_REPO1_PATH).toBeTruthy();
    expect(postgres.PGBACKREST_REPO1_PATH).not.toBe(await pgbackrestOption("global", "repo1-path"));
    expect(postgres.PGBACKREST_REPO1_S3_BUCKET).toBeTruthy();
    expect(postgres.PGBACKREST_REPO1_S3_BUCKET).not.toBe(
      await pgbackrestOption("global", "repo1-s3-bucket"),
    );
    expect(Object.values(compose.networks ?? {}).map((network) => network.internal)).toEqual([
      true,
    ]);
    for (const service of Object.values(compose.services)) {
      expect(service.ports).toBeUndefined();
    }
    for (const key of SECRET_KEYS) {
      expect(script).toMatch(new RegExp(`^${key}="[^"]*\\$\\(openssl rand `, "m"));
    }
  });

  it("stops waiting for the promotion after 300 s, or at once with the logs when postgres exited", async () => {
    const script = await textOf(DRILL_SCRIPT);
    const loops = promotionLoops(script);

    expect(script).toMatch(/^PROMOTION_TIMEOUT_SECONDS=300$/m);
    expect(loops.length).toBeGreaterThan(0);
    for (const body of loops) {
      expect(body).toMatch(/\$SECONDS" -ge "\$deadline"[\s\S]*exit 1/);
      expect(body).toMatch(/ps --status running[\s\S]*logs[\s\S]*exit 1/);
    }
  });
});

describe("the monthly drill workflow", () => {
  it("runs once a month on a schedule, only from main, and on schedule only when PGBACKREST_DRILL_ENABLED is true", async () => {
    const workflow = await workflowOf(DRILL_WORKFLOW);
    const crons = (workflow.on.schedule ?? []).map(({ cron }) => cron.split(" "));

    expect(crons).toHaveLength(1);
    expect(crons[0]?.slice(2)).toEqual([expect.stringMatching(/^([1-9]|1\d|2[0-8])$/), "*", "*"]);
    expect(workflow.on.workflow_dispatch).toBeDefined();
    expect(workflow.jobs.drill?.if).toBe(
      "(github.event_name == 'schedule' && vars.PGBACKREST_DRILL_ENABLED == 'true') || (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')",
    );
    expect(workflow.jobs.drill?.steps[0]?.with?.ref).toBe(
      `\${{ github.event_name == 'schedule' && 'main' || github.ref }}`,
    );
  });

  it("reads the backups with the read-only key of its own environment and can write nothing", async () => {
    const workflow = await workflowOf(DRILL_WORKFLOW);
    const text = await textOf(DRILL_WORKFLOW);
    const others = await Promise.all(OTHER_WORKFLOWS.map(textOf));
    const commands = text.match(/pgbackrest [^\n|]*/g) ?? [];

    expect(Object.values(workflow.jobs).map((job) => job.environment)).toEqual([DRILL_ENVIRONMENT]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs.drill?.permissions).toBeUndefined();
    for (const other of others) {
      expect(other).not.toContain(DRILL_ENVIRONMENT);
    }
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      expect(command).not.toMatch(WRITE_COMMANDS);
    }
    expect(text).toContain("--archive-mode=off");
    expect(text).toContain("-c archive_mode=off");
  });

  it("stops waiting at once with the logs when a restored instance exited", async () => {
    const loops = promotionLoops(await textOf(DRILL_WORKFLOW));

    expect(loops.length).toBeGreaterThan(0);
    for (const body of loops) {
      expect(body).toMatch(/State\.Running[\s\S]*docker logs[\s\S]*exit 1/);
    }
  });

  it("refuses a point in time older than the oldest backup before restoring it", async () => {
    const text = await textOf(DRILL_WORKFLOW);

    expect(text).toMatch(/pgbackrest [^\n]*--output=json[^\n]* info/);
    expect(text.indexOf("older than the oldest backup")).toBeGreaterThan(-1);
    expect(text.indexOf("older than the oldest backup")).toBeLessThan(
      text.indexOf("drill pgbackrest-pitr"),
    );
  });

  it("pings /fail only when the job did not succeed", async () => {
    const workflow = await workflowOf(DRILL_WORKFLOW);
    const ping = workflow.jobs.drill?.steps.find((step) => step.name === "Ping the end");

    expect(ping?.env?.OUTCOME).toBe(FAIL_ON_ANY_FAILURE);
  });
});

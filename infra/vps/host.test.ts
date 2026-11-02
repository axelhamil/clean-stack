import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, which } from "bun";
import { pathOf, textOf } from "../test-support";

const RULESET = "infra/vps/host.nft";
const EXAMPLE = "infra/vps/host.local.nft.example";
const BOOTSTRAP = "infra/vps/bootstrap.sh";
const PGBACKREST_RUN_PATH = pathOf("infra/vps/pgbackrest-run.sh");
const LOCAL_INCLUDE = "/etc/clean-stack/host.local.nft";
const CLOUDFLARE_INCLUDE = "/etc/clean-stack/cloudflare.nft";
const CLOUDFLARE_FIXTURE = [
  "add element inet clean_stack_host cloudflare_v4 { 173.245.48.0/20, 104.16.0.0/13 }",
  "add element inet clean_stack_host cloudflare_v6 { 2400:cb00::/32, 2606:4700::/32 }",
].join("\n");
const SBIN_PATH = `${process.env.PATH ?? ""}:/usr/sbin:/sbin:/usr/bin:/bin`;
const NFT = which("nft", { PATH: SBIN_PATH });
const UNSHARE = which("unshare", { PATH: SBIN_PATH });
const SYSTEMD_ANALYZE = which("systemd-analyze", { PATH: SBIN_PATH });
const INPUT_CLOUDFLARE =
  /^iifname @public_interfaces tcp dport \{ 80, 443 \} ip6? saddr @cloudflare_v[46] accept$/;
const FORWARD_CLOUDFLARE =
  /^iifname @public_interfaces ct state new meta l4proto tcp ct original proto-dst \{ 80, 443 \} ip6? saddr @cloudflare_v[46] accept$/;
const BACKUP_GRACE_MINUTES = 240;

const scratchDirectory = mkdtempSync(join(tmpdir(), "clean-stack-host-"));

afterAll(() => {
  rmSync(scratchDirectory, { recursive: true, force: true });
});

function readIfAny(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function withoutComments(source: string): string {
  return source.replace(/#.*$/gm, "");
}

function blockAfter(source: string, header: RegExp): string {
  const start = source.search(header);

  if (start < 0) {
    return "";
  }

  const open = source.indexOf("{", start);
  let depth = 0;

  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }

  return "";
}

function rulesOf(chainBody: string): string[] {
  return chainBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(type|policy)\b/.test(line));
}

async function parsed() {
  const source = withoutComments(await textOf(RULESET));
  const table = blockAfter(source, /\btable\s+inet\s+clean_stack_host\s*\{/);
  const chain = (hook: string) =>
    [...table.matchAll(/\bchain\s+([a-z0-9_]+)\s*\{/g)]
      .map((match) => blockAfter(table, new RegExp(`\\bchain\\s+${match[1] ?? ""}\\s*\\{`)))
      .find((body) => new RegExp(`\\bhook\\s+${hook}\\b`).test(body)) ?? "";

  return { source, table, input: chain("input"), forward: chain("forward") };
}

function minutesOf(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");

  return Number(hours) * 60 + Number(minutes);
}

type NftRun =
  | { kind: "skipped"; why: string }
  | { kind: "ran"; status: number | null; output: string };

function nftCheck(): NftRun {
  if (!NFT || !UNSHARE) {
    return { kind: "skipped", why: "nft or unshare is not on PATH" };
  }

  const cloudflare = join(scratchDirectory, "cloudflare.nft");
  const checked = join(scratchDirectory, "host.nft");
  writeFileSync(cloudflare, CLOUDFLARE_FIXTURE);
  writeFileSync(
    checked,
    readIfAny(pathOf(RULESET))
      .replace(LOCAL_INCLUDE, pathOf(EXAMPLE))
      .replace(CLOUDFLARE_INCLUDE, cloudflare),
  );
  const run = spawnSync(UNSHARE, ["-rn", NFT, "-c", "-f", checked], { encoding: "utf8" });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;

  if (run.error || /^unshare:/m.test(output)) {
    return { kind: "skipped", why: "no unprivileged user namespace for nft -c" };
  }

  return { kind: "ran", status: run.status, output };
}

const nft = nftCheck();

interface InterfaceCheck {
  listed: string[];
  present: string[];
  route: string;
}

async function checkPublicInterfaces({ listed, present, route }: InterfaceCheck) {
  const directory = mkdtempSync(join(scratchDirectory, "interfaces-"));
  const bin = join(directory, "bin");
  const net = join(directory, "net");
  const elements = listed.length
    ? `elements = { ${listed.map((name) => `"${name}"`).join(", ")} }`
    : "";
  const fn =
    /^check_public_interfaces\(\) \{\n[\s\S]*?^\}$/m.exec(await textOf(BOOTSTRAP))?.[0] ?? "";
  mkdirSync(bin);
  mkdirSync(net);
  for (const name of present) mkdirSync(join(net, name));
  writeFileSync(
    join(bin, "nft"),
    `#!/usr/bin/env bash\necho 'set public_interfaces {'\necho '  ${elements}'\necho '}'\n`,
  );
  writeFileSync(
    join(bin, "ip"),
    `#!/usr/bin/env bash\necho '1.1.1.1 via 10.0.0.1 dev ${route} src 10.0.0.2 uid 0'\n`,
  );
  chmodSync(join(bin, "nft"), 0o755);
  chmodSync(join(bin, "ip"), 0o755);

  return spawnSync(
    "bash",
    ["-c", `set -euo pipefail\nLOCAL=host.local.nft\n${fn}\ncheck_public_interfaces`],
    {
      encoding: "utf8",
      env: { PATH: `${bin}:${process.env.PATH ?? ""}`, CLEAN_STACK_SYS_CLASS_NET: net },
    },
  );
}

describe("the vps host firewall", () => {
  it("lets in from the public interface only Cloudflare on 80 and 443 and drops the rest", async () => {
    const { input } = await parsed();
    const rules = rulesOf(input);
    const publicAccepts = rules.filter(
      (rule) =>
        rule.startsWith("iifname @public_interfaces") &&
        rule.endsWith("accept") &&
        !rule.includes("icmpv6"),
    );

    expect(input).toMatch(/type\s+filter\s+hook\s+input\b[^;]*;\s*policy\s+drop\s*;/);
    expect(publicAccepts.length).toBeGreaterThan(0);
    for (const rule of publicAccepts) expect(rule).toMatch(INPUT_CLOUDFLARE);
    expect(rules.at(-1)).toMatch(/\bdrop$/);
  });

  it("forwards new public flows only from Cloudflare to the original ports 80 and 443, whatever port docker maps them to", async () => {
    const { forward, source } = await parsed();
    const rules = rulesOf(forward);
    const accepts = rules.filter((rule) => rule.endsWith("accept"));

    expect(forward).toMatch(/type\s+filter\s+hook\s+forward\b[^;]*;\s*policy\s+accept\s*;/);
    expect(accepts.length).toBeGreaterThan(0);
    for (const rule of accepts) expect(rule).toMatch(FORWARD_CLOUDFLARE);
    expect(forward).not.toMatch(/\bdport\b/);
    expect(rules.at(-1)).toBe(
      "iifname @public_interfaces ct state new,invalid,untracked counter drop",
    );
    expect(source).not.toMatch(/\bflush\s+ruleset\b/);
    expect(source).not.toMatch(/\btable\s+(ip|ip6|inet)\s+(filter|nat)\b/);
  });

  it("keeps interface names and Cloudflare ranges out of the committed table and loads them after it", async () => {
    const { source, table } = await parsed();
    const tableEnd = source.lastIndexOf("}");

    expect(table).not.toMatch(/\belements\b/);
    expect(source.indexOf(`include "${LOCAL_INCLUDE}"`)).toBeGreaterThan(tableEnd);
    expect(source.indexOf(`include "${CLOUDFLARE_INCLUDE}"`)).toBeGreaterThan(tableEnd);
  });

  it.skipIf(nft.kind !== "ran")(
    `passes the nft syntax check${nft.kind === "skipped" ? ` (skipped: ${nft.why})` : ""}`,
    () => {
      expect(nft.kind === "ran" ? nft.output : "").toBe("");
      expect(nft.kind === "ran" ? nft.status : null).toBe(0);
    },
  );
});

describe("the host bootstrap", () => {
  it("checks the ruleset before it enables the firewall, then checks the public interfaces it loaded", async () => {
    const script = await textOf(BOOTSTRAP);
    const syntax = spawnSync("bash", ["-n", pathOf(BOOTSTRAP)], { encoding: "utf8" });
    const enable = script.indexOf("systemctl enable --now clean-stack-host-firewall");

    expect(syntax.status).toBe(0);
    expect(script.indexOf("nft -c -f")).toBeGreaterThan(-1);
    expect(script.indexOf("nft -c -f")).toBeLessThan(enable);
    expect(script.lastIndexOf("check_public_interfaces")).toBeGreaterThan(enable);
  });

  it.each([
    [
      0,
      "every listed interface exists and one carries the default route",
      ["eth0", "eth1"],
      ["eth0", "eth1"],
      "eth1",
    ],
    [1, "the set is empty", [], ["eth0"], "eth0"],
    [1, "a listed interface does not exist on the host", ["eth0", "ens3"], ["eth0"], "eth0"],
    [
      1,
      "the default route leaves through an interface outside the set",
      ["eth1"],
      ["eth0", "eth1"],
      "eth0",
    ],
  ])(
    "exits %i from the public interface check when %s",
    async (status, _case, listed, present, route) => {
      const run = await checkPublicInterfaces({ listed, present, route });

      expect(run.status).toBe(status);
    },
  );

  it.skipIf(!SYSTEMD_ANALYZE)(
    `backs up full on Sunday and diff on the other days at 00:00 UTC, checks daily at 05:00 UTC and reboots after both${SYSTEMD_ANALYZE ? "" : " (skipped: systemd-analyze is not on PATH)"}`,
    async () => {
      const script = await textOf(BOOTSTRAP);
      const table = script.match(/<<'TIMERS'\n([\s\S]*?)\nTIMERS\n/)?.[1] ?? "";
      const timers = Object.fromEntries(
        table.split("\n").map((line) => {
          const [kind = "", ...calendar] = line.trim().split(/\s+/);

          return [kind, calendar.join(" ")];
        }),
      );
      const elapses = (calendar: string) => {
        const run = spawnSync(SYSTEMD_ANALYZE ?? "", ["calendar", "--iterations=14", calendar], {
          encoding: "utf8",
          env: { ...process.env, TZ: "Europe/Paris" },
        });

        return [...run.stdout.matchAll(/\(in UTC\): (\w{3}) \S+ (\d\d:\d\d):00 UTC/g)].map(
          ([, day, time]) => `${day} ${time}`,
        );
      };
      const full = elapses(timers.full ?? "");
      const diff = elapses(timers.diff ?? "");
      const check = elapses(timers.check ?? "");
      const reboot = /^REBOOT_AT="(\d\d:\d\d)"$/m.exec(script)?.[1] ?? "";

      expect(Object.keys(timers).sort()).toEqual(["check", "diff", "full"]);
      expect(full).toHaveLength(14);
      expect(new Set(full)).toEqual(new Set(["Sun 00:00"]));
      expect(new Set(diff)).toEqual(
        new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `${day} 00:00`)),
      );
      expect(new Set(check.map((elapse) => elapse.slice(4)))).toEqual(new Set(["05:00"]));
      expect(new Set(check.map((elapse) => elapse.slice(0, 3))).size).toBe(7);
      expect(minutesOf(reboot) - minutesOf("00:00")).toBeGreaterThanOrEqual(BACKUP_GRACE_MINUTES);
      expect(minutesOf(reboot)).toBeGreaterThan(minutesOf("05:00"));
    },
  );
});

interface RunOptions {
  containers?: string;
  url?: string;
  pgbackrestStatus?: number;
  curlStatus?: number;
  notReadyTimes?: number;
  readySeconds?: number;
  backupSeconds?: number;
  eventsLog?: string;
}

interface Harness {
  directory: string;
  env: Record<string, string>;
  logs: { docker: string; ready: string; events: string; curl: string };
}

function harness(kind: string, options: RunOptions = {}): Harness {
  const directory = mkdtempSync(join(scratchDirectory, "run-"));
  const bin = join(directory, "bin");
  const envFile = join(directory, "pgbackrest.env");
  const logs = {
    docker: join(directory, "docker.log"),
    ready: join(directory, "ready.log"),
    events: options.eventsLog ?? join(directory, "events.log"),
    curl: join(directory, "curl.log"),
  };
  const counter = join(directory, "ready.count");
  const urlKey = `HEARTBEAT_URL_PGBACKREST_${kind.toUpperCase()}`;
  mkdirSync(bin);
  writeFileSync(
    join(bin, "docker"),
    [
      "#!/usr/bin/env bash",
      'if [[ "$*" == *pg_isready* ]]; then',
      `  count=$(cat "${counter}" 2>/dev/null || echo 0)`,
      `  echo $((count + 1)) >"${counter}"`,
      `  echo "$*" >>"${logs.ready}"`,
      `  [[ "$count" -ge ${options.notReadyTimes ?? 0} ]] && exit 0`,
      "  exit 2",
      "fi",
      `echo "$*" >>"${logs.docker}"`,
      `echo "begin $4" >>"${logs.events}"`,
      `sleep ${options.backupSeconds ?? 0}`,
      `echo "end $4" >>"${logs.events}"`,
      `[[ "$*" == *failing* ]] && exit ${options.pgbackrestStatus ?? 0}`,
      "exit 0",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(bin, "curl"),
    `#!/usr/bin/env bash\necho "\${@: -1}" >>"${logs.curl}"\nexit ${options.curlStatus ?? 0}\n`,
  );
  chmodSync(join(bin, "docker"), 0o755);
  chmodSync(join(bin, "curl"), 0o755);
  writeFileSync(
    envFile,
    `PGBACKREST_CONTAINERS="${options.containers ?? "postgres-abc123"}"\n${options.url ? `${urlKey}=${options.url}\n` : ""}`,
  );

  return {
    directory,
    logs,
    env: {
      PATH: `${bin}:${SBIN_PATH}`,
      CLEAN_STACK_PGBACKREST_ENV: envFile,
      CLEAN_STACK_PGBACKREST_LOCK: join(scratchDirectory, "pgbackrest.lock"),
      CLEAN_STACK_PGBACKREST_READY_SECONDS: String(options.readySeconds ?? 120),
    },
  };
}

function lines(path: string): string[] {
  return readIfAny(path).split("\n").filter(Boolean);
}

function runPgbackrest(kind: string, options: RunOptions = {}) {
  const { env, logs } = harness(kind, options);
  const run = spawnSync("bash", [PGBACKREST_RUN_PATH, kind], { encoding: "utf8", env });

  return {
    status: run.status,
    output: `${run.stdout}${run.stderr}`,
    docker: lines(logs.docker),
    ready: lines(logs.ready),
    pings: lines(logs.curl),
  };
}

describe("the scheduled pgbackrest run", () => {
  it.each([
    [
      "full",
      "exec --user postgres postgres-abc123 pgbackrest --stanza=clean-stack --type=full backup",
    ],
    [
      "diff",
      "exec --user postgres postgres-abc123 pgbackrest --stanza=clean-stack --type=diff backup",
    ],
    ["check", "exec --user postgres postgres-abc123 pgbackrest --stanza=clean-stack check"],
  ])(
    "runs %s on the stanza as postgres once postgres is ready, without a ping when its url is empty",
    (kind, command) => {
      const run = runPgbackrest(kind);

      expect(run.status).toBe(0);
      expect(run.ready).toEqual(["exec --user postgres postgres-abc123 pg_isready --quiet"]);
      expect(run.docker).toEqual([command]);
      expect(run.pings).toEqual([]);
    },
  );

  it.each(["incr", "expire", "", "full; rm"])("refuses the kind %p and runs nothing", (kind) => {
    const run = runPgbackrest(kind);

    expect(run.status).toBe(2);
    expect(run.docker).toEqual([]);
  });

  it("waits for postgres to accept connections, and skips a container that never does", () => {
    const late = runPgbackrest("diff", { notReadyTimes: 1 });
    const never = runPgbackrest("diff", { notReadyTimes: 1_000, readySeconds: 1 });

    expect(late.status).toBe(0);
    expect(late.ready).toHaveLength(2);
    expect(late.docker).toHaveLength(1);
    expect(never.status).not.toBe(0);
    expect(never.docker).toEqual([]);
    expect(never.output).toContain("not ready");
  });

  it("backs up every listed container even when one fails, and fails with that exit code", () => {
    const run = runPgbackrest("diff", {
      containers: "postgres-failing postgres-ok",
      pgbackrestStatus: 57,
    });

    expect(run.status).toBe(57);
    expect(run.docker).toEqual([
      "exec --user postgres postgres-failing pgbackrest --stanza=clean-stack --type=diff backup",
      "exec --user postgres postgres-ok pgbackrest --stanza=clean-stack --type=diff backup",
    ]);
  });

  it("queues a run that starts while another one holds the lock", async () => {
    const eventsLog = join(scratchDirectory, "queue-events.log");
    const first = harness("full", { containers: "first", backupSeconds: 0.5, eventsLog });
    const second = harness("diff", { containers: "second", backupSeconds: 0.5, eventsLog });
    const runs = [first, second].map(({ env }, index) =>
      spawn(["bash", PGBACKREST_RUN_PATH, index === 0 ? "full" : "diff"], {
        env,
        stdout: "ignore",
        stderr: "ignore",
      }),
    );

    const statuses = await Promise.all(runs.map((run) => run.exited));
    const events = lines(first.logs.events);

    expect(statuses).toEqual([0, 0]);
    expect(events).toHaveLength(4);
    expect(events[0]?.replace("begin", "end")).toBe(events[1]);
    expect(events[2]?.replace("begin", "end")).toBe(events[3]);
  });

  it("pings start then success, or start then fail with the pgbackrest exit code kept, never printing the url", () => {
    const url = "https://hc.example.org/ping/secret-uuid/";
    const succeeded = runPgbackrest("diff", { url, curlStatus: 22 });
    const failed = runPgbackrest("full", {
      containers: "postgres-failing",
      url,
      pgbackrestStatus: 57,
    });

    expect(succeeded.status).toBe(0);
    expect(succeeded.pings).toEqual([
      "https://hc.example.org/ping/secret-uuid/start",
      "https://hc.example.org/ping/secret-uuid",
    ]);
    expect(failed.status).toBe(57);
    expect(failed.pings).toEqual([
      "https://hc.example.org/ping/secret-uuid/start",
      "https://hc.example.org/ping/secret-uuid/fail",
    ]);
    expect(`${succeeded.output}${failed.output}`).not.toContain("secret-uuid");
  });
});

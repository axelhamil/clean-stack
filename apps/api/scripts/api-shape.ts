import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listBackRoutes } from "../src/shared/surface/back-routes";
import { canonicalDeclaration } from "./type-text";

const API_ROOT = join(import.meta.dir, "..");
const SHAPE_DIR = join(API_ROOT, "shape");
const UPDATE_COMMAND = "pnpm api-shape:update";
const CONTEXT = 80;

interface Probe {
  name: string;
  file: string;
  read: () => string;
  frozenForm: (text: string) => string;
}

function emitAppTypeDeclaration(): string {
  const outDir = mkdtempSync(join(tmpdir(), "api-shape-"));

  try {
    const emit = spawnSync(
      "tsc",
      [
        "-p",
        "tsconfig.json",
        "--noEmit",
        "false",
        "--declaration",
        "--emitDeclarationOnly",
        "--removeComments",
        "--declarationMap",
        "false",
        "--incremental",
        "false",
        "--outDir",
        outDir,
      ],
      { cwd: API_ROOT, encoding: "utf8" },
    );

    if (emit.status !== 0) {
      throw new Error(`declaration emit failed:\n${emit.stdout}${emit.stderr}`);
    }

    return readFileSync(join(outDir, "src", "app.d.ts"), "utf8");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

const probes: Probe[] = [
  {
    name: "AppType",
    file: "app-type.d.ts.snap",
    read: emitAppTypeDeclaration,
    frozenForm: canonicalDeclaration,
  },
  {
    name: "route inventory",
    file: "routes.txt",
    read: () => `${listBackRoutes().join("\n")}\n`,
    frozenForm: (text) => text,
  },
];

function readFrozen(file: string): string | undefined {
  const path = join(SHAPE_DIR, file);

  if (!existsSync(path)) return undefined;

  return readFileSync(path, "utf8");
}

function firstDifference(frozen: string, current: string): string {
  let offset = 0;

  while (offset < frozen.length && frozen[offset] === current[offset]) offset++;

  const around = (text: string) =>
    JSON.stringify(text.slice(Math.max(0, offset - CONTEXT), offset + CONTEXT));

  return `from offset ${offset}\n  frozen:  ${around(frozen)}\n  current: ${around(current)}`;
}

function update(): void {
  for (const probe of probes) {
    writeFileSync(join(SHAPE_DIR, probe.file), probe.frozenForm(probe.read()));
    console.log(`api-shape: froze the ${probe.name} in shape/${probe.file}`);
  }
}

function check(): boolean {
  let equal = true;

  for (const probe of probes) {
    const frozen = readFrozen(probe.file);
    const current = probe.frozenForm(probe.read());

    if (frozen === current) {
      console.log(`api-shape: the ${probe.name} matches shape/${probe.file}`);
      continue;
    }

    equal = false;
    const detail =
      frozen === undefined ? "the frozen file is missing" : firstDifference(frozen, current);
    console.error(`api-shape: the ${probe.name} drifted from shape/${probe.file}, ${detail}`);
  }

  if (!equal) {
    console.error(`api-shape: an intended change is frozen again with \`${UPDATE_COMMAND}\`.`);
  }

  return equal;
}

if (process.argv.includes("--update")) {
  update();
  process.exit(0);
}

process.exit(check() ? 0 : 1);

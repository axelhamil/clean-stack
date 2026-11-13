import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { readsRawRequest } from "./route-inputs";

interface CodeViews {
  source: string;
  code: string;
  blanked: string;
  masked: string;
}

const TEST_DIRECTORIES = new Set(["__TESTS__", "__tests__"]);
const REGEX_PRECEDERS = new Set([..."(,=:[!&|?{};+-*%<>~^"]);

function endOfQuoted(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;

  while (index < source.length) {
    const char = source[index];

    if (char === quote) return index + 1;
    if (char === "\n") return index;

    index += char === "\\" ? 2 : 1;
  }

  return source.length;
}

function endOfRegex(source: string, start: number): number {
  let index = start + 1;
  let inClass = false;

  while (index < source.length && source[index] !== "\n") {
    const char = source[index];

    if (char === "/" && !inClass) {
      index += 1;
      while (/[a-z]/.test(source[index] ?? "")) index += 1;

      return index;
    }

    if (char === "[") inClass = true;
    if (char === "]") inClass = false;

    index += char === "\\" ? 2 : 1;
  }

  return index;
}

function maskOf(raw: string, head: number, tail: number): string {
  const end = Math.max(head, raw.length - tail);

  return raw.slice(0, head) + raw.slice(head, end).replace(/[^\n]/g, " ") + raw.slice(end);
}

function lex(source: string): CodeViews {
  const code: string[] = [];
  const blanked: string[] = [];
  const masked: string[] = [];
  const templateBraces: number[] = [];
  let previous = "";
  let index = 0;

  function emit(raw: string, blank = raw, mask = raw): void {
    code.push(raw);
    blanked.push(blank);
    masked.push(mask);
    if (raw.trim() !== "") previous = raw.trimEnd().at(-1) ?? previous;
  }

  function readTemplateChunk(start: number): number {
    let cursor = start + 1;

    while (cursor < source.length) {
      const char = source[cursor];

      if (char === "`") {
        const raw = source.slice(start, cursor + 1);
        emit(raw, `${source[start]}\``, maskOf(raw, 1, 1));
        return cursor + 1;
      }

      if (char === "$" && source[cursor + 1] === "{") {
        const raw = source.slice(start, cursor + 2);
        emit(raw, `${source[start]}\${`, maskOf(raw, 1, 2));
        templateBraces.push(0);
        return cursor + 2;
      }

      cursor += char === "\\" ? 2 : 1;
    }

    const raw = source.slice(start);
    emit(raw, source[start], maskOf(raw, 1, 0));
    return source.length;
  }

  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1];
    const depth = templateBraces.at(-1);

    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      masked.push(maskOf(source.slice(index, stop), 0, 0));
      index = stop;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      masked.push(maskOf(source.slice(index, stop), 0, 0));
      index = stop;
      continue;
    }

    if (char === "/" && (previous === "" || REGEX_PRECEDERS.has(previous))) {
      const end = endOfRegex(source, index);
      const raw = source.slice(index, end);
      emit(raw, "//", maskOf(raw, 1, 0));
      index = end;
      continue;
    }

    if (char === '"' || char === "'") {
      const end = endOfQuoted(source, index);
      const raw = source.slice(index, end);
      emit(raw, `${char}${char}`, maskOf(raw, 1, raw.length > 1 && raw.endsWith(char) ? 1 : 0));
      index = end;
      continue;
    }

    if (char === "`") {
      index = readTemplateChunk(index);
      continue;
    }

    if (char === "}" && depth === 0) {
      templateBraces.pop();
      index = readTemplateChunk(index);
      continue;
    }

    if (depth !== undefined && char === "{") templateBraces.push((templateBraces.pop() ?? 0) + 1);
    if (depth !== undefined && char === "}") templateBraces.push((templateBraces.pop() ?? 1) - 1);
    emit(char);
    index += 1;
  }

  return { source, code: code.join(""), blanked: blanked.join(""), masked: masked.join("") };
}

function countOf(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

export function createSourceScan(root: string) {
  function isProductionSource(path: string): boolean {
    return (
      path.endsWith(".ts") &&
      !path.endsWith(".test.ts") &&
      !path.split(sep).some((segment) => TEST_DIRECTORIES.has(segment))
    );
  }

  function sourceFiles(layer: string): string[] {
    return readdirSync(join(root, layer), { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(root, join(entry.parentPath, entry.name)))
      .filter(isProductionSource)
      .sort();
  }

  function viewsOf(file: string): CodeViews {
    return lex(readFileSync(join(root, file), "utf8"));
  }

  function codeOf(file: string): string {
    return viewsOf(file).code;
  }

  function countPerFile(
    layer: string,
    count: (views: CodeViews) => number,
  ): Record<string, number> {
    return Object.fromEntries(
      sourceFiles(layer)
        .map((file): [string, number] => [file, count(viewsOf(file))])
        .filter(([, total]) => total !== 0),
    );
  }

  function throwsPerFile(layer: string): Record<string, number> {
    return countPerFile(layer, ({ blanked }) => countOf(blanked, /\bthrow\b/g));
  }

  function writeCallsPerFile(layer: string): Record<string, number> {
    return countPerFile(layer, ({ code }) =>
      countOf(code, /\.(?:insert|update|delete)\((?!\s*["'`])/g),
    );
  }

  function transactionParametersPerFile(layer: string): Record<string, number> {
    return countPerFile(
      layer,
      ({ blanked }) => countOf(blanked, /\btx\??:/g) + countOf(blanked, /\bITransaction\b/g),
    );
  }

  function transactionOpenersPerFile(layer: string): Record<string, number> {
    return countPerFile(
      layer,
      ({ code, blanked }) =>
        countOf(blanked, /\.transaction\s*\(\s*[^\s)]/g) +
        countOf(code, /\[\s*(["'`])transaction\1\s*\]\s*\(/g),
    );
  }

  function envReadsPerFile(layer: string): Record<string, number> {
    return countPerFile(
      layer,
      ({ code, blanked }) =>
        countOf(blanked, /\b(?:process|Bun)\s*\??\.\s*env\b/g) +
        countOf(blanked, /\bimport\.meta\.env\b/g) +
        countOf(
          blanked,
          /\{(?:[^{}]|\{[^{}]*\})*\benv\b(?:[^{}]|\{[^{}]*\})*\}\s*=\s*(?:process|Bun)\b(?!\s*\??\.)/g,
        ) +
        countOf(code, /\b(?:process|Bun)\s*\??\.?\s*\[\s*(["'`])env\1\s*\]/g) +
        countOf(code, /\bimport\s*\{[^}]*\benv\b[^}]*\}\s*from\s*(["'])(?:node:)?process\1/g),
    );
  }

  return {
    sourceFiles,
    viewsOf,
    codeOf,
    throwsPerFile,
    writeCallsPerFile,
    transactionParametersPerFile,
    transactionOpenersPerFile,
    envReadsPerFile,
  };
}

const SPECIFIER = /\b(?:from|import|require)\s*\(?\s*(["'])([^"'\n]+)\1/g;
const HOST_PATH =
  /^(?:apps\/|(?:container|auth|composition)(?:\.ts)?(?:\/|$)|shared\/(?:env(?:\.ts)?$|middleware\/))/;
const CONTAINER_AUGMENTATION = /declare\s+module\s+["']inwire["']/;

function hostPathOf(specifier: string): string {
  return specifier.replace(/^(?:@\/|(?:\.\.?\/)+)/, "");
}

export function reachesHost(code: string): boolean {
  const specifiers = [...code.matchAll(SPECIFIER)].map((match) => match[2] ?? "");

  return (
    CONTAINER_AUGMENTATION.test(code) ||
    specifiers.some((specifier) => HOST_PATH.test(hostPathOf(specifier)))
  );
}

export function isRouteFile(file: string): boolean {
  const segments = file.split(sep);
  const name = segments.at(-1) ?? "";
  const underHttpRoutes = segments.some(
    (segment, index) => segment === "http" && segments[index + 1] === "routes",
  );

  return underHttpRoutes || name === "routes.ts" || name.endsWith(".routes.ts");
}

function existingLayers(root: string, names: string[]): string[] {
  return names.filter((name) => existsSync(join(root, name)));
}

const ROOT_ENTRIES = new Set([
  "application",
  "domain",
  "infra",
  "infrastructure",
  ...TEST_DIRECTORIES,
]);
const DOMAIN_CATEGORIES = new Set([
  "aggregates",
  "entities",
  "value-objects",
  "events",
  "services",
]);
const INFRASTRUCTURE_DIRECTORIES = new Set(["infra", "infrastructure"]);
const TEMPLATE_IMPORT = /\bimport\s*\(\s*`([^`]*)`/g;
const HANDLER_KIT_IMPORTS = new Set([
  "@packages/ddd-kit",
  "@packages/events",
  "@packages/outbox/payload-parser",
]);

function entriesOf(root: string, folder: string): string[] {
  const path = join(root, folder);

  if (!existsSync(path)) return [];

  return readdirSync(path).sort();
}

function isRootEntry(entry: string): boolean {
  return (
    ROOT_ENTRIES.has(entry) ||
    entry.startsWith(".") ||
    entry.endsWith(".module.ts") ||
    entry.endsWith(".d.ts")
  );
}

function strayRootEntries(srcRoot: string): string[] {
  return entriesOf(srcRoot, ".").filter((entry) => !isRootEntry(entry));
}

function domainCategoryFolders(srcRoot: string): string[] {
  return entriesOf(srcRoot, "domain")
    .filter((entry) => DOMAIN_CATEGORIES.has(entry))
    .map((entry) => join("domain", entry));
}

function isHttpEntryFile(file: string): boolean {
  const segments = file.split(sep);
  const underInfrastructureHttp = segments.some(
    (segment, index) => INFRASTRUCTURE_DIRECTORIES.has(segment) && segments[index + 1] === "http",
  );

  return underInfrastructureHttp || isRouteFile(file) || file.endsWith(".route.ts");
}

function importSpecifiers(code: string): string[] {
  return [...code.matchAll(SPECIFIER), ...code.matchAll(TEMPLATE_IMPORT)].map((match) =>
    match[0].includes("`") ? (match[1] ?? "") : (match[2] ?? ""),
  );
}

function isHandlerImport(handler: string, specifier: string): boolean {
  if (HANDLER_KIT_IMPORTS.has(specifier)) return true;
  if (!specifier.startsWith(".") || specifier.includes("${")) return false;

  const target = posix.join(posix.dirname(handler.split(sep).join("/")), specifier);
  const name = (target.split("/").at(-1) ?? "").replace(/\.[jt]s$/, "");
  const isEvent =
    name.endsWith(".event") &&
    (target.startsWith("application/events/") || /^domain\/(?:[^/]+\/)+events\//.test(target));

  return isEvent || target.startsWith("application/usecases/");
}

function importsBeyondHandlerReach(handler: string, code: string): boolean {
  return importSpecifiers(code).some((specifier) => !isHandlerImport(handler, specifier));
}

function isEventHandlerFile(file: string): boolean {
  return file.split(sep).slice(0, 2).join("/") === "application/event-handlers";
}

export interface ModuleLayeringOptions {
  targetShape?: boolean;
}

function targetShapeGuards(
  srcRoot: string,
  scan: ReturnType<typeof createSourceScan>,
  files: string[],
): Record<string, string[]> {
  return {
    "module root holds only the target entries": strayRootEntries(srcRoot),
    "no category folder at the root of domain": domainCategoryFolders(srcRoot),
    "no application dto folder": existingLayers(srcRoot, [join("application", "dto")]),
    "route inputs validated by zV": files
      .filter(isHttpEntryFile)
      .filter((file) => readsRawRequest(scan.viewsOf(file))),
    "handlers import only use cases, the event and the payload parser": files
      .filter(isEventHandlerFile)
      .filter((file) => importsBeyondHandlerReach(file, scan.codeOf(file))),
  };
}

export function assertModuleLayering(srcRoot: string, options: ModuleLayeringOptions = {}): void {
  const scan = createSourceScan(srcRoot);
  const files = scan.sourceFiles(".");

  if (files.length === 0) throw new Error(`module layering: no source file under ${srcRoot}`);

  const throwing = existingLayers(srcRoot, ["domain", "application"]).flatMap((layer) =>
    Object.keys(scan.throwsPerFile(layer)),
  );

  const guards: Record<string, string[]> = {
    "domain and application never throw": throwing,
    "routes never write": Object.keys(scan.writeCallsPerFile(".")).filter(isRouteFile),
    "no tx parameter": Object.keys(scan.transactionParametersPerFile(".")),
    "no transaction opened": Object.keys(scan.transactionOpenersPerFile(".")),
    "no environment read": Object.keys(scan.envReadsPerFile(".")),
    "no host reach": files.filter((file) => reachesHost(scan.codeOf(file))),
    ...(options.targetShape ? targetShapeGuards(srcRoot, scan, files) : {}),
  };

  const violations = Object.entries(guards).flatMap(([guard, offenders]) =>
    offenders.map((file) => `${guard}: ${file}`),
  );

  if (violations.length > 0) {
    throw new Error(`module layering violated in ${srcRoot}:\n${violations.join("\n")}`);
  }
}

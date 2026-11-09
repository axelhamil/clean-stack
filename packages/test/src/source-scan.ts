import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

interface CodeViews {
  code: string;
  blanked: string;
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

function lex(source: string): CodeViews {
  const code: string[] = [];
  const blanked: string[] = [];
  const templateBraces: number[] = [];
  let previous = "";
  let index = 0;

  function emit(raw: string, blank = raw): void {
    code.push(raw);
    blanked.push(blank);
    if (raw.trim() !== "") previous = raw.trimEnd().at(-1) ?? previous;
  }

  function readTemplateChunk(start: number): number {
    let cursor = start + 1;

    while (cursor < source.length) {
      const char = source[cursor];

      if (char === "`") {
        emit(source.slice(start, cursor + 1), `${source[start]}\``);
        return cursor + 1;
      }

      if (char === "$" && source[cursor + 1] === "{") {
        emit(source.slice(start, cursor + 2), `${source[start]}\${`);
        templateBraces.push(0);
        return cursor + 2;
      }

      cursor += char === "\\" ? 2 : 1;
    }

    emit(source.slice(start), source[start]);
    return source.length;
  }

  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1];
    const depth = templateBraces.at(-1);

    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }

    if (char === "/" && (previous === "" || REGEX_PRECEDERS.has(previous))) {
      const end = endOfRegex(source, index);
      emit(source.slice(index, end), "//");
      index = end;
      continue;
    }

    if (char === '"' || char === "'") {
      const end = endOfQuoted(source, index);
      emit(source.slice(index, end), `${char}${char}`);
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

  return { code: code.join(""), blanked: blanked.join("") };
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
    return countPerFile(layer, ({ blanked }) => countOf(blanked, /\.transaction\s*\(\s*[^\s)]/g));
  }

  function envReadsPerFile(layer: string): Record<string, number> {
    return countPerFile(
      layer,
      ({ code, blanked }) =>
        countOf(blanked, /\b(?:process|Bun)\s*\??\.\s*env\b/g) +
        countOf(blanked, /\bimport\.meta\.env\b/g) +
        countOf(blanked, /\{[^{}]*\benv\b[^{}]*\}\s*=\s*(?:process|Bun)\b(?!\s*\??\.)/g) +
        countOf(code, /\b(?:process|Bun)\s*\??\.?\s*\[\s*(["'`])env\1\s*\]/g),
    );
  }

  return {
    sourceFiles,
    codeOf,
    throwsPerFile,
    writeCallsPerFile,
    transactionParametersPerFile,
    transactionOpenersPerFile,
    envReadsPerFile,
  };
}

const HOST_REACH = [
  /from\s+["'][./]*container["']/,
  /from\s+["'][./]*auth["']/,
  /from\s+["'][./]*shared\/env["']/,
  /from\s+["'][./]*shared\/middleware\//,
  /declare\s+module\s+["']inwire["']/,
];

function isRouteFile(file: string): boolean {
  const name = file.split(sep).at(-1) ?? "";

  return name === "routes.ts" || name.endsWith(".routes.ts");
}

function existingLayers(root: string, names: string[]): string[] {
  return names.filter((name) => existsSync(join(root, name)));
}

export function assertModuleLayering(srcRoot: string): void {
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
    "no host reach": files.filter((file) =>
      HOST_REACH.some((pattern) => pattern.test(scan.codeOf(file))),
    ),
  };

  const violations = Object.entries(guards).flatMap(([guard, offenders]) =>
    offenders.map((file) => `${guard}: ${file}`),
  );

  if (violations.length > 0) {
    throw new Error(`module layering violated in ${srcRoot}:\n${violations.join("\n")}`);
  }
}

import { readdirSync, readFileSync } from "node:fs";
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

    if (char === "\\") index += 2;
    else if (char === quote) return index + 1;
    else if (char === "\n") return index;
    else index += 1;
  }

  return source.length;
}

function endOfRegex(source: string, start: number): number {
  let index = start + 1;
  let inClass = false;

  while (index < source.length && source[index] !== "\n") {
    const char = source[index];

    if (char === "\\") index += 1;
    else if (char === "[") inClass = true;
    else if (char === "]") inClass = false;
    else if (char === "/" && !inClass) {
      index += 1;
      while (/[a-z]/.test(source[index] ?? "")) index += 1;

      return index;
    }

    index += 1;
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

      if (char === "\\") cursor += 2;
      else if (char === "`") {
        emit(source.slice(start, cursor + 1), `${source[start]}\``);
        return cursor + 1;
      } else if (char === "$" && source[cursor + 1] === "{") {
        emit(source.slice(start, cursor + 2), `${source[start]}\${`);
        templateBraces.push(0);
        return cursor + 2;
      } else cursor += 1;
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
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
    } else if (char === "/" && (previous === "" || REGEX_PRECEDERS.has(previous))) {
      const end = endOfRegex(source, index);
      emit(source.slice(index, end), "//");
      index = end;
    } else if (char === '"' || char === "'") {
      const end = endOfQuoted(source, index);
      emit(source.slice(index, end), `${char}${char}`);
      index = end;
    } else if (char === "`") {
      index = readTemplateChunk(index);
    } else if (char === "}" && depth === 0) {
      templateBraces.pop();
      index = readTemplateChunk(index);
    } else {
      if (depth !== undefined && char === "{") templateBraces.push((templateBraces.pop() ?? 0) + 1);
      if (depth !== undefined && char === "}") templateBraces.push((templateBraces.pop() ?? 1) - 1);
      emit(char);
      index += 1;
    }
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
    envReadsPerFile,
  };
}

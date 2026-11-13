interface MaskedSource {
  source: string;
  masked: string;
}

interface Span {
  start: number;
  end: number;
}

type ReadKind = { kind: "allowed" } | { kind: "validated"; target: string } | { kind: "raw-body" };

const REGISTRATION = /\.\s*(?:get|post|put|patch|delete|all|options|on|use)\s*(?:<[^>]*>)?\s*\(/g;
const DECLARATION =
  /\b(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=|function\s+([A-Za-z_$][\w$]*))/g;
const REQUEST_TOKEN = /\breq\b/g;
const COOKIE_HELPER = /\b(?:getCookie|getSignedCookie)\s*\(/g;
const RAW_BODY_OPT_OUT = /\/\/[ \t]*raw-body:[ \t]*\S/;
const ALLOWED_MEMBERS = new Set(["valid", "method", "path", "routePath"]);
const RAW_BODY_MEMBERS = new Set(["text", "arrayBuffer", "blob", "raw"]);
const VALIDATED_MEMBERS: Record<string, string> = {
  param: "param",
  query: "query",
  queries: "query",
  json: "json",
  header: "header",
  parseBody: "form",
  formData: "form",
};
const OPENERS = new Set(["(", "[", "{"]);
const CLOSERS = new Set([")", "]", "}"]);

function depthsOf(masked: string): number[] {
  const depths: number[] = [];
  let depth = 0;

  for (const char of masked) {
    if (CLOSERS.has(char)) depth -= 1;
    depths.push(depth);
    if (OPENERS.has(char)) depth += 1;
  }

  return depths;
}

function matchingClose(masked: string, open: number): number {
  let depth = 0;

  for (let index = open; index < masked.length; index += 1) {
    const char = masked[index] ?? "";

    if (OPENERS.has(char)) depth += 1;
    if (CLOSERS.has(char)) depth -= 1;
    if (depth === 0) return index;
  }

  return masked.length;
}

function stringAt({ source, masked }: MaskedSource, quote: number): string {
  const close = masked.indexOf(masked[quote] ?? "", quote + 1);

  return source.slice(quote + 1, close === -1 ? masked.length : close);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function registrations(masked: string): Span[] {
  return [...masked.matchAll(REGISTRATION)].map((match) => {
    const open = match.index + match[0].length - 1;

    return { start: open, end: matchingClose(masked, open) };
  });
}

function validatorNames(masked: string): string[] {
  const aliases = [...masked.matchAll(/\bzV\s+as\s+([A-Za-z_$][\w$]*)/g)].map(
    (match) => match[1] ?? "",
  );

  return ["zV", ...aliases];
}

function validatorCalls(file: MaskedSource, names: string[], span: Span): string[] {
  const call = new RegExp(
    `(?<![\\w$.])(?:${names.map(escapeRegExp).join("|")})\\s*(?:<[^>]*>)?\\s*\\(\\s*(["'\`])`,
    "g",
  );
  const text = file.masked.slice(span.start, span.end);

  return [...text.matchAll(call)].map((match) =>
    stringAt(file, span.start + match.index + match[0].length - 1),
  );
}

function hoistedValidators(file: MaskedSource, names: string[]): Map<string, string[]> {
  const hoisted = new Map<string, string[]>();

  for (const match of file.masked.matchAll(DECLARATION)) {
    const name = match[1];
    if (name === undefined) continue;

    const start = match.index + match[0].length;
    const statementEnd = file.masked.indexOf(";", start);
    const span = { start, end: statementEnd === -1 ? file.masked.length : statementEnd };
    const targets = validatorCalls(file, names, span);

    if (targets.length > 0) hoisted.set(name, targets);
  }

  return hoisted;
}

function mentions(masked: string, span: Span, name: string): boolean {
  return new RegExp(`(?<![\\w$.])${escapeRegExp(name)}(?![\\w$])`).test(
    masked.slice(span.start, span.end),
  );
}

function targetsOf(
  file: MaskedSource,
  span: Span,
  names: string[],
  hoisted: Map<string, string[]>,
): Set<string> {
  const fromHoisted = [...hoisted].flatMap(([name, targets]) =>
    mentions(file.masked, span, name) ? targets : [],
  );

  return new Set([...validatorCalls(file, names, span), ...fromHoisted]);
}

function outermostEnclosing(spans: Span[], index: number): Span | undefined {
  return spans.find((span) => span.start < index && index < span.end);
}

function enclosingDeclarations(masked: string, depths: number[], index: number): string[] {
  const depthAtRead = depths[index] ?? 0;

  return [...masked.slice(0, index).matchAll(DECLARATION)]
    .filter((match) => {
      const depth = depths[match.index] ?? 0;
      const between = depths.slice(match.index, index);

      return depth < depthAtRead && between.every((value) => value >= depth);
    })
    .map((match) => match[1] ?? match[2] ?? "")
    .reverse();
}

function requestRead(file: MaskedSource, token: number): ReadKind | undefined {
  const before = file.masked.slice(0, token).trimEnd();

  if (!before.endsWith(".")) return undefined;

  const after = file.masked.slice(token + "req".length);
  const member = /^\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)/.exec(after);
  const element = /^\s*(?:\?\.)?\s*\[\s*(["'`])/.exec(after);
  const name =
    member?.[1] ??
    (element ? stringAt(file, token + "req".length + element[0].length - 1) : undefined);

  if (name === undefined) return undefined;
  if (ALLOWED_MEMBERS.has(name)) return { kind: "allowed" };
  if (RAW_BODY_MEMBERS.has(name)) return { kind: "raw-body" };

  const target = VALIDATED_MEMBERS[name];

  return target === undefined ? undefined : { kind: "validated", target };
}

function lineAround(source: string, index: number): string {
  const lineStart = source.lastIndexOf("\n", index - 1) + 1;
  const previousStart = source.lastIndexOf("\n", lineStart - 2) + 1;
  const lineEnd = source.indexOf("\n", index);

  return source.slice(previousStart, lineEnd === -1 ? source.length : lineEnd);
}

export function readsRawRequest(file: MaskedSource): boolean {
  const routes = registrations(file.masked);
  const names = validatorNames(file.masked);
  const hoisted = hoistedValidators(file, names);
  const depths = depthsOf(file.masked);

  function validatedAt(index: number, target: string): boolean {
    const route = outermostEnclosing(routes, index);
    if (route) return targetsOf(file, route, names, hoisted).has(target);

    for (const declaration of enclosingDeclarations(file.masked, depths, index)) {
      const mounts = routes.filter((span) => mentions(file.masked, span, declaration));

      if (mounts.length > 0) {
        return mounts.every((span) => targetsOf(file, span, names, hoisted).has(target));
      }
    }

    return false;
  }

  const requestReads = [...file.masked.matchAll(REQUEST_TOKEN)].some((match) => {
    const read = requestRead(file, match.index);

    if (read === undefined) return true;
    if (read.kind === "allowed") return false;
    if (read.kind === "raw-body")
      return !RAW_BODY_OPT_OUT.test(lineAround(file.source, match.index));

    return !validatedAt(match.index, read.target);
  });

  const cookieReads = [...file.masked.matchAll(COOKIE_HELPER)].some(
    (match) => !validatedAt(match.index, "cookie"),
  );

  return requestReads || cookieReads;
}

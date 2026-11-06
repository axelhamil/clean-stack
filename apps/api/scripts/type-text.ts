const CLOSER: Record<string, string> = { "{": "}", "<": ">", "(": ")", "[": "]" };
const CLOSERS = new Set(Object.values(CLOSER));
const QUOTES = new Set(['"', "'", "`"]);

function stringEnd(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;

  while (index < text.length && text[index] !== quote) {
    index += text[index] === "\\" ? 2 : 1;
  }

  return index;
}

function isArrowHead(text: string, index: number): boolean {
  return text[index] === ">" && text[index - 1] === "=";
}

function matchingClose(text: string, open: number): number {
  let depth = 0;

  for (let index = open; index < text.length; index++) {
    const char = text[index] ?? "";

    if (QUOTES.has(char)) {
      index = stringEnd(text, index);
      continue;
    }

    if (isArrowHead(text, index)) continue;

    if (CLOSER[char] !== undefined) depth++;

    if (CLOSERS.has(char)) depth--;

    if (depth === 0) return index;
  }

  throw new Error(`unbalanced type text from offset ${open}`);
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index++) {
    const char = text[index] ?? "";

    if (QUOTES.has(char)) {
      index = stringEnd(text, index);
      continue;
    }

    if (CLOSER[char] !== undefined) {
      index = matchingClose(text, index);
      continue;
    }

    if (!text.startsWith(separator, index)) continue;

    parts.push(text.slice(start, index));
    start = index + separator.length;
    index = start - 1;
  }

  parts.push(text.slice(start));

  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function canonicalMember(text: string): string {
  const [key = "", ...value] = splitTopLevel(text, ":");

  if (value.length === 0) return canonicalType(key);

  return `${canonicalAtom(key)}: ${canonicalType(withoutImpliedUndefined(key, value.join(":")))}`;
}

function withoutImpliedUndefined(key: string, value: string): string {
  if (!key.trim().endsWith("?") || splitTopLevel(value, "=>").length > 1) return value;

  const members = splitTopLevel(value, "|");
  const defined = members.filter((member) => member !== "undefined");

  return defined.length > 0 ? defined.join(" | ") : value;
}

function canonicalGroup(open: string, inner: string): string {
  if (open === "{") return splitTopLevel(inner, ";").map(canonicalMember).sort().join("; ");

  if (open === "<") return splitTopLevel(inner, ",").map(canonicalType).join(", ");

  return splitTopLevel(inner, ",").map(canonicalMember).join(", ");
}

function canonicalAtom(text: string): string {
  let canonical = "";
  let index = 0;

  while (index < text.length) {
    const char = text[index] ?? "";
    const closer = CLOSER[char];

    if (QUOTES.has(char)) {
      const end = stringEnd(text, index);
      canonical += text.slice(index, end + 1);
      index = end + 1;
      continue;
    }

    if (closer === undefined) {
      canonical += char;
      index++;
      continue;
    }

    const end = matchingClose(text, index);
    canonical += `${char}${canonicalGroup(char, text.slice(index + 1, end))}${closer}`;
    index = end + 1;
  }

  return canonical.trim();
}

function canonicalType(text: string): string {
  if (splitTopLevel(text, " extends ").length > 1) return canonicalAtom(text);

  const [parameters = "", ...returned] = splitTopLevel(text, "=>");

  if (returned.length > 0) {
    return `${canonicalAtom(parameters)} => ${canonicalType(returned.join("=>"))}`;
  }

  return splitTopLevel(text, "|")
    .map((member) => splitTopLevel(member, "&").map(canonicalAtom).join(" & "))
    .sort()
    .join(" | ");
}

function canonicalStatement(text: string): string {
  const [head = "", ...aliased] = splitTopLevel(text, " = ");

  if (aliased.length === 0) return canonicalMember(text);

  return `${canonicalAtom(head)} = ${canonicalType(aliased.join(" = "))}`;
}

const LOCAL_SPECIFIER = /(import\(|from )"(\.{1,2}\/|@modules\/)[^"]*"/g;

export function canonicalDeclaration(declaration: string): string {
  const located = declaration.replace(/\s+/g, " ").replace(LOCAL_SPECIFIER, '$1"<local>"');

  return splitTopLevel(located, ";").map(canonicalStatement).join(";\n");
}

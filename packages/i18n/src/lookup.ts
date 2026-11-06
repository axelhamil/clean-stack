function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Walks a catalog node along a dotted key. `undefined` when the path does not
 * end on a string, which is what a missing or mistyped key looks like. Tests
 * read copy through it without booting i18next.
 */
export function lookupCatalogValue(node: unknown, path: string): string | undefined {
  let current = node;
  for (const segment of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }

  return typeof current === "string" ? current : undefined;
}

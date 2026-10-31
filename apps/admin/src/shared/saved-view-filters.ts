export type ViewFilters = Record<string, string | undefined>;

function canonical(filters: ViewFilters): string {
  const set = Object.entries(filters).filter(([, value]) => value);

  return JSON.stringify(set.sort(([a], [b]) => a.localeCompare(b)));
}

export function hasFilters(filters: ViewFilters): boolean {
  return Object.values(filters).some(Boolean);
}

export function sameFilters(a: ViewFilters, b: ViewFilters): boolean {
  return canonical(a) === canonical(b);
}

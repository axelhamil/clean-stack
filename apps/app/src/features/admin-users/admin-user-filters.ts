export interface UserFilters {
  search: string;
  role: "admin" | "user" | undefined;
  banned: boolean | undefined;
}

export function serializeUserFilters(filters: UserFilters): Record<string, string> {
  const query: Record<string, string> = {};
  const search = filters.search.trim();
  if (search) query.search = search;
  if (filters.role) query.role = filters.role;
  if (filters.banned !== undefined) query.banned = String(filters.banned);
  return query;
}

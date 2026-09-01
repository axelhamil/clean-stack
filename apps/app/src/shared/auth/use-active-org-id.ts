import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { activeOrgQueryOptions } from "../api/queries/active-org";

/**
 * The organization the server will scope the next request to, or `null` when the
 * session has none. `null` is a real value here, not an error or a placeholder:
 * "no active organization" is a valid transient state (see Org-scoping rule 2),
 * and it is also a distinct server-side scope for the queries that accept it.
 *
 * Every org-scoped query key is built from this — never from `undefined`, which
 * a key cannot carry without two different scopes collapsing onto one entry.
 */
export function useActiveOrgId(): string | null {
  const { data: org } = useQuery(activeOrgQueryOptions);
  return org?.id ?? null;
}

/** Loader/`beforeLoad` counterpart of {@link useActiveOrgId}. */
export async function ensureActiveOrgId(queryClient: QueryClient): Promise<string | null> {
  const org = await queryClient.ensureQueryData(activeOrgQueryOptions);
  return org?.id ?? null;
}

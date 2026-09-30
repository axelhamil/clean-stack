interface AuthClientResult<T> {
  data: T | null;
  error: { code?: string } | null;
}

/**
 * BetterAuth answers `NO_ACTIVE_ORGANIZATION` as an error, but between
 * organizations (or before the self-heal) it is a valid transient state:
 * letting it bubble would crash every `ensureQueryData` consumer. The
 * org-scoped reads resolve it to `null`, and rethrow anything else.
 */
export function nullWithoutActiveOrganization<T>({ data, error }: AuthClientResult<T>): T | null {
  if (error?.code === "NO_ACTIVE_ORGANIZATION") return null;
  if (error) throw error;

  return data ?? null;
}

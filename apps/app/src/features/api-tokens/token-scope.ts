/**
 * The list mixes two scopes — the active organization's tokens and the
 * caller's org-less ones — so every row has to say which one it is, otherwise
 * the fix trades an invisible token for an ambiguous one.
 *
 * Kept free of React so it can be asserted directly under the node-environment
 * test runner: the decision is data, only the badge around it is markup.
 */
export type TokenScopeDisplay =
  | { kind: "personal" }
  | { kind: "organization"; name: string | null };

export function tokenScopeDisplay(
  organizationId: string | null,
  activeOrg: { id: string; name: string } | null | undefined,
): TokenScopeDisplay {
  if (organizationId === null) return { kind: "personal" };
  // A row from an organization other than the active one should never reach the
  // list; if one ever did, label it generically rather than with the wrong name.
  return {
    kind: "organization",
    name: activeOrg && activeOrg.id === organizationId ? activeOrg.name : null,
  };
}

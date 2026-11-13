import type { Option } from "@packages/ddd-kit";

export type TokenOwner =
  | { kind: "personal"; userId: string }
  | { kind: "orgAndPersonal"; userId: string; organizationId: string };

export function tokenOwnerForSession(
  userId: string,
  activeOrganizationId: Option<string>,
): TokenOwner {
  return activeOrganizationId.isSome()
    ? { kind: "orgAndPersonal", userId, organizationId: activeOrganizationId.unwrap() }
    : { kind: "personal", userId };
}

export function ownerReaches(
  owner: TokenOwner,
  token: { userId: string; organizationId: Option<string> },
): boolean {
  if (token.userId !== owner.userId) return false;
  if (token.organizationId.isNone()) return true;

  return owner.kind === "orgAndPersonal" && token.organizationId.unwrap() === owner.organizationId;
}

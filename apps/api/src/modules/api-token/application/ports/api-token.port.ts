import type { Option, Result } from "@packages/ddd-kit";
import type { ApiTokenRevokedReason } from "@packages/drizzle";
import type { ITransaction } from "../../../../shared/transaction";

export type ApiTokenError = {
  code: "API_TOKEN_PROVIDER_FAILURE" | "API_TOKEN_NOT_FOUND" | "API_TOKEN_EXPIRY_INVALID";
  message: string;
  metadata?: Record<string, unknown>;
};

export type ApiTokenRecord = {
  id: string;
  userId: string;
  organizationId: string | null;
  name: string;
  scopes: string[];
  tokenHmac: string;
  pepperVersion: number;
  tokenStart: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedReason: ApiTokenRevokedReason | null;
  createdAt: Date;
};

/**
 * Which token rows an authenticated actor may see and revoke.
 *
 * - `personal`       → the actor's rows that carry no organization
 * - `orgAndPersonal` → the actor's rows in that organization, *plus* their org-less rows
 *
 * Both variants are anchored on `userId`: an actor never reaches another
 * member's token, whichever organization it belongs to.
 *
 * A closed union rather than the former `{ organizationId: string | null }`:
 * that shape could only ever name one of the two scopes the create form
 * offers, and since every user owns a personal organization the `null` branch
 * was unreachable in practice — a token created with the "Personal" scope was
 * invisible, and therefore unrevocable, for its own owner. The union states
 * the selected set in its variant name instead of encoding it in a nullable
 * field, so a third scope has to be declared rather than smuggled in as a flag.
 */
export type TokenOwner =
  | { kind: "personal"; userId: string }
  | { kind: "orgAndPersonal"; userId: string; organizationId: string };

/**
 * The confinement rule itself, stated once, in the layer that owns it and free
 * of any ORM import so it can be asserted for what it is. The Drizzle
 * repository transcribes it into a WHERE clause; `ApiTokenService` re-applies
 * it to whatever the repository returns, so a leak would have to defeat both
 * the query and the guard. A row out of reach is *absent* — never a 403, which
 * would confirm the token exists.
 */
export function ownerReaches(
  owner: TokenOwner,
  row: { userId: string; organizationId: string | null },
): boolean {
  if (row.userId !== owner.userId) return false;
  if (row.organizationId === null) return true;
  return owner.kind === "orgAndPersonal" && row.organizationId === owner.organizationId;
}

/** The visibility scope of a session. No active organization → personal rows only. */
export function tokenOwnerForSession(
  userId: string,
  activeOrganizationId: string | null,
): TokenOwner {
  return activeOrganizationId === null
    ? { kind: "personal", userId }
    : { kind: "orgAndPersonal", userId, organizationId: activeOrganizationId };
}

export interface IApiTokenRepository {
  insert(row: ApiTokenRecord, tx?: ITransaction): Promise<Result<void, ApiTokenError>>;
  listByOwner(owner: TokenOwner): Promise<Result<ApiTokenRecord[], ApiTokenError>>;
  findByIdForOwner(
    id: string,
    owner: TokenOwner,
  ): Promise<Result<Option<ApiTokenRecord>, ApiTokenError>>;
  findByHmac(hmac: string): Promise<Result<Option<ApiTokenRecord>, ApiTokenError>>;
  revoke(
    id: string,
    reason: ApiTokenRevokedReason,
    tx?: ITransaction,
  ): Promise<Result<void, ApiTokenError>>;
  revokeAllForMembership(
    userId: string,
    organizationId: string,
    tx?: ITransaction,
  ): Promise<Result<string[], ApiTokenError>>;
  touchLastUsed(id: string, bucketFloor: Date): Promise<Result<boolean, ApiTokenError>>;
  rehash(id: string, hmac: string, pepperVersion: number): Promise<Result<void, ApiTokenError>>;
}

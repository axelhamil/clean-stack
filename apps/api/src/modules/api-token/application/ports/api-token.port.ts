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

export type TokenOwner = { userId: string; organizationId: string | null };

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

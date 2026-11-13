import type { Option, Result } from "@packages/ddd-kit";
import type {
  ApiToken,
  ApiTokenProps,
  RevokedReason,
} from "../../../domain/api-token/api-token.aggregate";
import type { ApiTokenId } from "../../../domain/api-token/api-token-id";
import type { TokenOwner } from "../../../domain/api-token/services/token-visibility.service";
import type { ApiScope } from "../../../domain/api-token/value-objects/token-scopes.vo";

export type ApiTokenError = {
  code:
    | "API_TOKEN_PROVIDER_FAILURE"
    | "API_TOKEN_NOT_FOUND"
    | "API_TOKEN_EXPIRY_INVALID"
    | "API_TOKEN_SCOPES_INVALID";
  message: string;
  metadata?: Record<string, unknown>;
};

export type ApiTokenRecord = Omit<ApiTokenProps, "scopes"> & { id: string; scopes: ApiScope[] };

export type RevokedToken = { tokenId: string; organizationId: Option<string> };

export interface BulkRevocation {
  userId: string;
  organizationId: Option<string>;
  reason: RevokedReason;
}

export interface IApiTokenRepository {
  insert(token: ApiToken): Promise<Result<void, ApiTokenError>>;
  findByIdForOwner(
    id: ApiTokenId,
    owner: TokenOwner,
  ): Promise<Result<Option<ApiToken>, ApiTokenError>>;
  findByHmac(hmac: string): Promise<Result<Option<ApiTokenRecord>, ApiTokenError>>;
  revoke(token: ApiToken): Promise<Result<boolean, ApiTokenError>>;
  revokeAllOfUser(revocation: BulkRevocation): Promise<Result<RevokedToken[], ApiTokenError>>;
  touchLastUsed(id: string, bucketFloor: Date): Promise<Result<boolean, ApiTokenError>>;
  rehash(id: string, hmac: string, pepperVersion: number): Promise<Result<void, ApiTokenError>>;
}

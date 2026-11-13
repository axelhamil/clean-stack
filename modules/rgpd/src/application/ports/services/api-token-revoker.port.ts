import type { AppError, Option, Result } from "@packages/ddd-kit";

export interface RevokedApiToken {
  tokenId: string;
  organizationId: Option<string>;
}

export interface IApiTokenRevoker {
  execute(input: { userId: string }): Promise<Result<RevokedApiToken[], AppError>>;
}

import type { AppError, Result } from "@packages/ddd-kit";
import type { RevokedApiToken } from "./rgpd.port";

export interface IApiTokenRevoker {
  revokeAllOfUser(userId: string): Promise<Result<RevokedApiToken[], AppError>>;
}

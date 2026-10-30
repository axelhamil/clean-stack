import type { AppError, Option, Result } from "@packages/ddd-kit";

export interface PreviousSession {
  id: string;
  country: Option<string>;
  createdAt: Date;
}

export type SessionGeoError = AppError<"SESSION_GEO_PROVIDER_FAILURE">;

export interface ISessionGeoStore {
  findPreviousSession(
    userId: string,
    excludedSessionId: string,
    since: Date,
  ): Promise<Result<Option<PreviousSession>, SessionGeoError>>;
}

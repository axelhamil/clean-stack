import type { ApiToken } from "../../../domain/api-token/api-token.aggregate";

export interface CreateApiTokenInput {
  userId: string;
  actorUserId: string;
  name: string;
  scopes: string[];
  organizationId: string | null;
  expiresInDays: number | null;
}

export interface CreateApiTokenOutput {
  token: ApiToken;
  raw: string;
}

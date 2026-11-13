import type { TokenOwner } from "../../../domain/api-token/services/token-visibility.service";

export interface RevokeApiTokenInput {
  id: string;
  owner: TokenOwner;
  actorUserId: string;
}

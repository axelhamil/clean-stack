import type { IQuery } from "@packages/ddd-kit";
import type { ApiToken } from "../../domain/api-token/api-token.aggregate";
import type { TokenOwner } from "../../domain/api-token/services/token-visibility.service";
import type { ApiTokenError } from "../ports/repositories/api-token.port";

export interface ListApiTokensInput {
  owner: TokenOwner;
}

export type IListApiTokensQuery = IQuery<ListApiTokensInput, ApiToken[], ApiTokenError>;

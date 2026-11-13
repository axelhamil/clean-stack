import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { dbOperationFailure, resolveExecutor } from "@packages/drizzle";
import * as apiTokenSchema from "../../../schemas/api-token";
import type { ApiTokenError } from "../../application/ports/repositories/api-token.port";
import type {
  IListApiTokensQuery,
  ListApiTokensInput,
} from "../../application/queries/list-api-tokens.query";
import type { ApiToken } from "../../domain/api-token/api-token.aggregate";
import { ownerReaches } from "../../domain/api-token/services/token-visibility.service";
import { toApiToken } from "../repos/drizzle/api-token.mapper";
import { mappedOrFailure, visibleTokensFilter } from "../repos/drizzle/api-token.repository";

const dbAttrs = { "db.system.name": "postgresql" } as const;
const storeFailure = dbOperationFailure("API_TOKEN_PROVIDER_FAILURE");

export class DrizzleListApiTokensQuery implements IListApiTokensQuery {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async execute({ owner }: ListApiTokensInput): Promise<Result<ApiToken[], ApiTokenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleListApiTokensQuery > execute" },
      async () => {
        try {
          const query = exec
            .select()
            .from(apiTokenSchema.apiToken)
            .where(visibleTokensFilter(owner));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          const tokens = mappedOrFailure(
            Result.all(rows.map(toApiToken)),
            "listByOwner",
            this.instrumentation,
          );

          return tokens.map((all) =>
            all.filter((token) =>
              ownerReaches(owner, {
                userId: token.get("userId"),
                organizationId: token.get("organizationId"),
              }),
            ),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("listByOwner"));
        }
      },
    );
  }
}

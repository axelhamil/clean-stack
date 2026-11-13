import { type AppError, Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const API_SCOPES = ["read:profile", "write:profile", "read:organizations"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const tokenScopesSchema = z.array(z.enum(API_SCOPES)).min(1);

export type TokenScopesInvalid = AppError<"API_TOKEN_SCOPES_INVALID">;

const SCOPES_INVALID: TokenScopesInvalid = {
  code: "API_TOKEN_SCOPES_INVALID",
  message: `Choose at least one scope among ${API_SCOPES.join(", ")}.`,
};

export class TokenScopes extends ValueObject<ApiScope[], TokenScopesInvalid> {
  static parse(value: unknown): Result<TokenScopes, TokenScopesInvalid> {
    const parsed = tokenScopesSchema.safeParse(value);
    if (!parsed.success) return Result.fail(SCOPES_INVALID);

    return Result.ok(new TokenScopes(parsed.data));
  }

  protected validate(value: ApiScope[]): Result<ApiScope[], TokenScopesInvalid> {
    return tokenScopesSchema.safeParse(value).success
      ? Result.ok(value)
      : Result.fail(SCOPES_INVALID);
  }
}

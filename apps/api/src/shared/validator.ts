import { zValidator } from "@hono/zod-validator";
import type { Env, Input, MiddlewareHandler, ValidationTargets } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ZodType } from "zod";

/**
 * Typed alias for the `zV` middleware factory.
 *
 * Re-typed so the return value is `MiddlewareHandler<E, P, V>` rather than the
 * union `MiddlewareHandler | Response` that `zValidator` normally produces.
 * That union leaks into Hono RPC's response type inference — `zV` casts it away
 * so validation failures throw `HTTPException(400)` and the happy-path response
 * type stays clean.
 */
type ZV = <
  T extends ZodType,
  Target extends keyof ValidationTargets,
  E extends Env = Env,
  P extends string = string,
  In = T["_zod"]["input"],
  Out = T["_zod"]["output"],
  I extends Input = {
    in: { [K in Target]: In };
    out: { [K in Target]: Out };
  },
  V extends I = I,
>(
  target: Target,
  schema: T,
) => MiddlewareHandler<E, P, V>;

/**
 * Drop-in replacement for `zValidator` that throws `HTTPException(400)` on
 * validation failure instead of returning a `Response` inline.
 *
 * Why: the default `zValidator` widens the route's return type with an error
 * branch, which pollutes Hono RPC's inferred response union on the client.
 * Throwing keeps the type clean and delegates error formatting to the central
 * `errorHandler`.
 */
export const zV = ((target: keyof ValidationTargets, schema: ZodType) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".") || "_"}: ${issue.message}`)
        .join("; ");
      throw new HTTPException(400, { message });
    }
  })) as ZV;

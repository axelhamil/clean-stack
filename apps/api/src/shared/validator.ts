import { zValidator } from "@hono/zod-validator";
import { AppErrorException } from "@packages/ddd-kit";
import type { Env, Input, MiddlewareHandler, ValidationTargets } from "hono";
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
 * Drop-in replacement for `zValidator` that throws `REQUEST_INVALID` on
 * validation failure instead of returning a `Response` inline.
 *
 * Why an error *code* and not a bare `HTTPException`: the client resolves user
 * copy from the code, so a rejection that carries none falls through to the
 * caller's generic fallback and the user is told "please try again" about a
 * field they could have fixed. A named code lands on the localised
 * `_INVALID` copy in every language, and the offending fields travel in
 * `metadata` where a support ticket or a log line can still name them.
 *
 * Why throwing at all: the default `zValidator` widens the route's return type
 * with an error branch, which pollutes Hono RPC's inferred response union on
 * the client. Throwing keeps the type clean and delegates error formatting to
 * the central `errorHandler`.
 */
export const zV = ((target: keyof ValidationTargets, schema: ZodType) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      const fields = result.error.issues.map((issue) => ({
        path: issue.path.join(".") || "_",
        message: issue.message,
      }));
      throw new AppErrorException({
        code: "REQUEST_INVALID",
        message: fields.map((f) => `${f.path}: ${f.message}`).join("; "),
        metadata: { fields },
      });
    }
  })) as ZV;

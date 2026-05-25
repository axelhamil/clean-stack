import { zValidator } from "@hono/zod-validator";
import type { Env, Input, MiddlewareHandler, ValidationTargets } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ZodType } from "zod";

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

export const zV = ((target: keyof ValidationTargets, schema: ZodType) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".") || "_"}: ${issue.message}`)
        .join("; ");
      throw new HTTPException(400, { message });
    }
  })) as ZV;

import { type AppError, AppErrorException, type Option, type Result } from "@packages/ddd-kit";
import type { Context } from "hono";

export function gateOr202(c: Context, gated: Result<Option<string>, AppError>) {
  if (gated.isFailure) throw new AppErrorException(gated.getError());

  const pending = gated.getValue();

  return pending.isSome() ? c.json({ approvalId: pending.unwrap() }, 202) : null;
}

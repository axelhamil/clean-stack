import { type AppError, AppErrorException, type Result } from "@packages/ddd-kit";
import type { Context } from "hono";
import type { GatedOutcome } from "../../application/services/gated-outcome";

export function gatedResponse(c: Context, outcome: Result<GatedOutcome, AppError>) {
  if (outcome.isFailure) throw new AppErrorException(outcome.getError());

  const pending = outcome.getValue().pendingApprovalId;

  return pending.isSome() ? c.json({ approvalId: pending.unwrap() }, 202) : c.json({ ok: true });
}

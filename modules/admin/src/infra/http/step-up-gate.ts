import { AppErrorException, Result } from "@packages/ddd-kit";
import type { RouteGuards } from "@packages/http/route-guards";
import type { Context } from "hono";
import type {
  IStepUpGate,
  StepUpRefusal,
} from "../../application/ports/services/step-up-gate.port";

export function stepUpGateOf(guards: Pick<RouteGuards, "assertStepUp">, c: Context): IStepUpGate {
  return {
    async confirm(): Promise<Result<void, StepUpRefusal>> {
      try {
        await guards.assertStepUp(c);
        return Result.ok();
      } catch (error) {
        if (!(error instanceof AppErrorException)) throw error;

        return Result.fail({ code: error.code, message: error.message, metadata: error.metadata });
      }
    },
  };
}

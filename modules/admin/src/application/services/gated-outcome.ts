import { type Option, Result } from "@packages/ddd-kit";

export interface GatedOutcome {
  pendingApprovalId: Option<string>;
}

export async function runUnlessGated<E, F>(
  gated: Result<Option<string>, E>,
  run: () => Promise<Result<void, F>>,
): Promise<Result<GatedOutcome, E | F>> {
  if (gated.isFailure) return Result.fail(gated.getError());

  const pendingApprovalId = gated.getValue();
  if (pendingApprovalId.isSome()) return Result.ok({ pendingApprovalId });

  const done = await run();
  if (done.isFailure) return Result.fail(done.getError());

  return Result.ok({ pendingApprovalId });
}

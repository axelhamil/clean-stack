import { di } from "../container";
import { logger } from "../shared/logger";
import { requestClientIp } from "./visitor";

export async function acceptStalePoliciesAtFirstVerification(userId: string): Promise<void> {
  const stale = await di.PolicyAcceptanceService.getStaleTypes(userId);
  if (stale.isFailure) {
    logger.error(
      { err: stale.getError(), userId },
      "policy staleness check failed at verify-email",
    );
    return;
  }
  if (stale.getValue().length === 0) return;

  const ip = requestClientIp() ?? undefined;
  const recorded = await di.PolicyAcceptanceService.accept(userId, stale.getValue(), ip);
  if (recorded.isFailure) {
    logger.error({ err: recorded.getError(), userId }, "policy acceptance failed at verify-email");
  }
}

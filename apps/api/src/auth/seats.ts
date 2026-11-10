import { hasSeatAvailable } from "@modules/billing/domain/entitlements";
import { ambientTransaction } from "@packages/drizzle";
import { di } from "../container";
import { countActiveMembers, lockSeatsOf } from "./queries";

/**
 * The seat cap itself: one question, one answer, for every surface that creates a
 * member.
 * Centralised so the check is never duplicated across hooks (CLAUDE.md
 * reusability rule, §6 two-path trap).
 *
 * Inside a BetterAuth transaction (SCIM provisioning, SSO sign-in) the count runs on
 * that transaction behind a per-organization lock held until it commits, so two
 * concurrent provisionings cannot both take the last seat.
 */
export async function seatCapFor(
  orgId: string,
): Promise<{ available: boolean; activeMembers: number; maxMembers: number | null }> {
  const view = await di.EntitlementsService.getEntitlements(orgId);
  if (ambientTransaction().isSome()) await lockSeatsOf(orgId);
  const activeMembers = await countActiveMembers(orgId);
  return {
    available: hasSeatAvailable(activeMembers, view.maxMembers),
    activeMembers,
    maxMembers: view.maxMembers,
  };
}

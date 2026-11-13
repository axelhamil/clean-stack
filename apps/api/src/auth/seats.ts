import { hasSeatAvailable } from "@modules/billing/rules/entitlements";
import { ambientTransaction } from "@packages/drizzle";
import type { AuthDeps } from "./deps";

export type SeatCap = { available: boolean; activeMembers: number; maxMembers: number | null };

export function createSeatCap(deps: Pick<AuthDeps, "entitlements" | "queries">): {
  seatCapFor(orgId: string): Promise<SeatCap>;
} {
  return {
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
    async seatCapFor(orgId) {
      const view = (await deps.entitlements.execute({ organizationId: orgId })).getValue();
      if (ambientTransaction().isSome()) await deps.queries.lockSeatsOf(orgId);
      const activeMembers = await deps.queries.countActiveMembers(orgId);
      return {
        available: hasSeatAvailable(activeMembers, view.maxMembers),
        activeMembers,
        maxMembers: view.maxMembers,
      };
    },
  };
}

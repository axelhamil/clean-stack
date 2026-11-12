import { APIError } from "better-auth/api";

type SeatCap = (
  organizationId: string,
) => Promise<{ available: boolean; maxMembers: number | null }>;

export const ORGANIZATION_SEAT_PAYMENT_REQUIRED = "ORGANIZATION_SEAT_PAYMENT_REQUIRED";

export function organizationSeatGate(
  seatCapFor: SeatCap,
): (organizationId: string) => Promise<void> {
  return async (organizationId) => {
    const { available, maxMembers } = await seatCapFor(organizationId);
    if (available) return;

    throw new APIError("PAYMENT_REQUIRED", {
      code: ORGANIZATION_SEAT_PAYMENT_REQUIRED,
      message: `Seat limit reached (${maxMembers ?? "∞"}). Upgrade the plan or remove a member, then retry.`,
    });
  };
}

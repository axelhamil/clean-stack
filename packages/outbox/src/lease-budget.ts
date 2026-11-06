export type Clock = () => number;

export const monotonicClock: Clock = () => performance.now();

export interface LeaseBudget {
  unitSeconds: number;
  marginSeconds: number;
}

export function unitsWithinLease(leaseSeconds: number, budget: LeaseBudget): number {
  return Math.max(1, Math.floor((leaseSeconds - budget.marginSeconds) / budget.unitSeconds));
}

export function leaseCountdown(
  leaseSeconds: number,
  budget: LeaseBudget,
  clock: Clock,
): { coversNextUnit(): boolean } {
  const deadline = clock() + leaseSeconds * 1000;
  const neededMs = (budget.unitSeconds + budget.marginSeconds) * 1000;

  return { coversNextUnit: () => deadline - clock() >= neededMs };
}

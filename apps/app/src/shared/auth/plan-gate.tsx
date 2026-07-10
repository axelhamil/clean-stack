import type { ReactNode } from "react";
import type { Tier } from "../api/queries/billing-types";
import { useEntitlements } from "./use-entitlements";

interface PlanGateProps {
  min: Tier;
  fallback?: ReactNode;
  children: ReactNode;
}

export function PlanGate({ min, fallback = null, children }: PlanGateProps) {
  const { atLeast } = useEntitlements();
  return <>{atLeast(min) ? children : fallback}</>;
}

import type { ReactNode } from "react";
import { useEntitlements } from "./use-entitlements";

interface PlanGateProps {
  min: "free" | "pro" | "business";
  fallback?: ReactNode;
  children: ReactNode;
}

export function PlanGate({ min, fallback = null, children }: PlanGateProps) {
  const { atLeast } = useEntitlements();
  return <>{atLeast(min) ? children : fallback}</>;
}

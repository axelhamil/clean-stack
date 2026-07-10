import type { ReactNode } from "react";
import { useEntitlements } from "./use-entitlements";

interface FeatureGateProps {
  feature: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export function FeatureGate({ feature, fallback = null, children }: FeatureGateProps) {
  const { hasFeature } = useEntitlements();
  return <>{hasFeature(feature) ? children : fallback}</>;
}

import type { ReactNode } from "react";
import { useEntitlements } from "./use-entitlements";

interface QuotaGateProps {
  quotaKey: string;
  used: number;
  fallback?: ReactNode;
  children: ReactNode;
}

export function QuotaGate({ quotaKey, used, fallback = null, children }: QuotaGateProps) {
  const { useQuota } = useEntitlements();
  return <>{useQuota(quotaKey, used).exceeded ? fallback : children}</>;
}

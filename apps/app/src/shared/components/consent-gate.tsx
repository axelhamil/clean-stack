import type { ConsentCategory } from "@packages/cookie-consent";
import type { ReactNode } from "react";
import { useConsent } from "../hooks/use-consent";

interface ConsentGateProps {
  category: ConsentCategory;
  children: ReactNode;
  fallback?: ReactNode;
}

export function ConsentGate({ category, children, fallback = null }: ConsentGateProps) {
  return useConsent(category) ? children : fallback;
}

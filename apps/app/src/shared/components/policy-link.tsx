import { POLICY_URLS, type PolicyType } from "@packages/policies";
import { TextLink } from "@packages/ui/components/ui/text-link";
import type { ReactNode } from "react";

interface PolicyLinkProps {
  type: PolicyType;
  children: ReactNode;
}

export function PolicyLink({ type, children }: PolicyLinkProps) {
  return (
    <TextLink href={POLICY_URLS[type]} target="_blank" rel="noopener noreferrer">
      {children}
    </TextLink>
  );
}

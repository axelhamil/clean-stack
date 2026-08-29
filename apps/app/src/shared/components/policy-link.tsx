import { POLICY_URLS, type PolicyType } from "@packages/policies";
import { TextLink } from "@packages/ui/components/ui/text-link";
import type { ReactNode } from "react";

interface PolicyLinkProps {
  type: PolicyType;
  // Optional because `<Trans>` clones this element and injects the translated
  // text as children at render time — the JSX call site passes none.
  children?: ReactNode;
}

export function PolicyLink({ type, children }: PolicyLinkProps) {
  return (
    <TextLink href={POLICY_URLS[type]} target="_blank" rel="noopener noreferrer">
      {children}
    </TextLink>
  );
}

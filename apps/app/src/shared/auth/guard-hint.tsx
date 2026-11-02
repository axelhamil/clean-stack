import { Hint } from "@packages/ui/components/ui/hint";
import type { ReactNode } from "react";
import { type ImpersonationGuard, isFrozenByGuard } from "./use-impersonation-guard";

interface GuardHintProps {
  guard: ImpersonationGuard;
  otherwiseDisabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function GuardHint({ guard, otherwiseDisabled, className, children }: GuardHintProps) {
  return (
    <Hint
      text={isFrozenByGuard(guard, otherwiseDisabled) ? guard.reason : undefined}
      showOnTouch={false}
      className={className}
    >
      {children}
    </Hint>
  );
}

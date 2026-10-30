import { StepUpDialog } from "@packages/ui/components/ui/step-up-dialog";
import { useStepUpDialog } from "@packages/web-kit/auth/use-step-up-dialog";
import { verifyStepUpMutationOptions } from "../api/mutations/verify-step-up";

export function StepUpGate() {
  return <StepUpDialog {...useStepUpDialog(verifyStepUpMutationOptions, { namespace: "admin" })} />;
}

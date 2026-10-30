import type { ApprovalAction } from "@packages/access-control";
import { AppErrorException, type Option } from "@packages/ddd-kit";
import { di } from "../../container";

export async function approvalGate(input: {
  action: ApprovalAction;
  subjectId: string;
  params: unknown;
  requestedBy: string;
}): Promise<Option<string>> {
  const gated = await di.ApprovalService.gate(input);
  if (gated.isFailure) throw new AppErrorException(gated.getError());

  return gated.getValue();
}

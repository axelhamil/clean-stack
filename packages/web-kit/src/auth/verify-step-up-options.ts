import { mutationOptions } from "@tanstack/react-query";
import { throwApiError } from "../api/errors/api-error";

interface StepUpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: Pick<Headers, "get">;
  json(): Promise<unknown>;
}

export function verifyStepUpOptions(
  verify: (args: { json: { code: string } }) => Promise<StepUpResponse>,
) {
  return mutationOptions({
    mutationKey: ["admin", "step-up"] as const,
    mutationFn: async (json: { code: string }) => {
      const res = await verify({ json });
      if (!res.ok) await throwApiError(res, "verifyStepUp");

      return res.json();
    },
  });
}

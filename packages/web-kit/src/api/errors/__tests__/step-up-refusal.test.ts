import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { watchStepUpRefusals } from "../step-up-refusal";

function refusal(code: string): Error {
  return Object.assign(new Error(code), { code, status: 403 });
}

async function failMutation(queryClient: QueryClient, error: Error): Promise<void> {
  await queryClient
    .getMutationCache()
    .build(queryClient, {
      mutationFn: async () => {
        throw error;
      },
      retry: false,
    })
    .execute(undefined)
    .catch(() => {});
}

describe("watchStepUpRefusals", () => {
  it("opens the prompt when a mutation is refused for lack of a step-up", async () => {
    const queryClient = new QueryClient();
    const onRefusal = vi.fn();
    watchStepUpRefusals(queryClient, onRefusal);

    await failMutation(queryClient, refusal("ADMIN_REAUTH_REQUIRED"));

    expect(onRefusal).toHaveBeenCalledTimes(1);
  });

  it("stays closed on any other 403", async () => {
    const queryClient = new QueryClient();
    const onRefusal = vi.fn();
    watchStepUpRefusals(queryClient, onRefusal);

    await failMutation(queryClient, refusal("ADMIN_STAFF_PERMISSION_FORBIDDEN"));

    expect(onRefusal).not.toHaveBeenCalled();
  });
});

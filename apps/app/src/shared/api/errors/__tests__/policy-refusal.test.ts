import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ApiError } from "../api-error";
import { handlePolicyRefusal, watchPolicyRefusals } from "../policy-refusal";

function apiError(code: string, status: number): ApiError {
  const err = new Error(code) as ApiError;
  err.code = code;
  err.status = status;
  return err;
}

function clientWithStalePolicies() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["policies"], { terms: { current: true } });
  return queryClient;
}

describe("handlePolicyRefusal", () => {
  it("refetches the policy status and hands control back to the router", async () => {
    const queryClient = clientWithStalePolicies();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const refreshRouter = vi.fn().mockResolvedValue(undefined);

    const handled = await handlePolicyRefusal(
      apiError("POLICY_ACCEPTANCE_REQUIRED", 409),
      queryClient,
      refreshRouter,
    );

    expect(handled).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["policies"], refetchType: "all" });
    expect(refreshRouter).toHaveBeenCalledTimes(1);
  });

  it("ignores any other 409 — the generic conflict keeps its generic handling", async () => {
    const queryClient = clientWithStalePolicies();
    const refreshRouter = vi.fn();

    expect(await handlePolicyRefusal(apiError("HTTP_409", 409), queryClient, refreshRouter)).toBe(
      false,
    );
    expect(await handlePolicyRefusal(new Error("boom"), queryClient, refreshRouter)).toBe(false);
    expect(await handlePolicyRefusal(null, queryClient, refreshRouter)).toBe(false);
    expect(refreshRouter).not.toHaveBeenCalled();
  });
});

describe("watchPolicyRefusals", () => {
  it("reacts to a failing mutation without the call site opting in", async () => {
    const queryClient = clientWithStalePolicies();
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const refreshRouter = vi.fn().mockResolvedValue(undefined);
    const unsubscribe = watchPolicyRefusals(queryClient, refreshRouter);

    await queryClient
      .getMutationCache()
      .build(queryClient, {
        mutationFn: () => Promise.reject(apiError("POLICY_ACCEPTANCE_REQUIRED", 409)),
        retry: false,
      })
      .execute(undefined)
      .catch(() => {});

    expect(refreshRouter).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("reacts to a failing query the same way", async () => {
    const queryClient = clientWithStalePolicies();
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const refreshRouter = vi.fn().mockResolvedValue(undefined);
    const unsubscribe = watchPolicyRefusals(queryClient, refreshRouter);

    await queryClient
      .fetchQuery({
        queryKey: ["anything"],
        queryFn: () => Promise.reject(apiError("POLICY_ACCEPTANCE_REQUIRED", 409)),
        retry: false,
      })
      .catch(() => {});

    expect(refreshRouter).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("stops reacting once unsubscribed", async () => {
    const queryClient = clientWithStalePolicies();
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const refreshRouter = vi.fn().mockResolvedValue(undefined);
    watchPolicyRefusals(queryClient, refreshRouter)();

    await queryClient
      .fetchQuery({
        queryKey: ["anything"],
        queryFn: () => Promise.reject(apiError("POLICY_ACCEPTANCE_REQUIRED", 409)),
        retry: false,
      })
      .catch(() => {});

    expect(refreshRouter).not.toHaveBeenCalled();
  });
});

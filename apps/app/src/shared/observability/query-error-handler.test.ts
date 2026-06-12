import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onMutationError, onQueryError } from "./query-error-handler";
import { captureError } from "./sentry";

vi.mock("./sentry", () => ({
  captureError: vi.fn(),
}));

function makeClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: onQueryError }),
    mutationCache: new MutationCache({ onError: onMutationError }),
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  });
}

function apiError(status: number): Error {
  return Object.assign(new Error(`http ${status}`), { status, code: `ERR_${status}` });
}

describe("onQueryError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures 5xx query failures with queryKey context", async () => {
    const err = apiError(500);
    await makeClient()
      .fetchQuery({ queryKey: ["things"], queryFn: () => Promise.reject(err) })
      .catch(() => {});
    expect(captureError).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ queryKey: ["things"], status: 500, code: "ERR_500" }),
    );
  });

  it("captures network errors without status", async () => {
    const err = new TypeError("Failed to fetch");
    await makeClient()
      .fetchQuery({ queryKey: ["things"], queryFn: () => Promise.reject(err) })
      .catch(() => {});
    expect(captureError).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ queryKey: ["things"] }),
    );
  });

  it("skips expected 4xx query failures", async () => {
    await makeClient()
      .fetchQuery({ queryKey: ["things"], queryFn: () => Promise.reject(apiError(404)) })
      .catch(() => {});
    expect(captureError).not.toHaveBeenCalled();
  });
});

describe("onMutationError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures 5xx mutation failures with mutationKey context", async () => {
    const err = apiError(503);
    const client = makeClient();
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ["create-thing"],
      mutationFn: () => Promise.reject(err),
    });
    await mutation.execute(undefined).catch(() => {});
    expect(captureError).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ mutationKey: ["create-thing"], status: 503 }),
    );
  });

  it("skips expected 429 mutation failures", async () => {
    const client = makeClient();
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(apiError(429)),
    });
    await mutation.execute(undefined).catch(() => {});
    expect(captureError).not.toHaveBeenCalled();
  });

  it("skips flow-control errors thrown by mutation hooks", async () => {
    const client = makeClient();
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(new Error("Cancelled")),
    });
    await mutation.execute(undefined).catch(() => {});
    expect(captureError).not.toHaveBeenCalled();
  });
});

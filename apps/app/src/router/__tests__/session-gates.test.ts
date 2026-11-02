import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionQueryOptions } from "../../shared/api/queries/session";
import { refetchSession } from "../../shared/auth/use-refresh-session";
import { Route as GuestRoute } from "../_guest";
import { Route as ProtectedRoute } from "../_protected";
import { Route as IndexRoute } from "../index.route";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("../../shared/auth/auth-client", () => ({ authClient: { getSession } }));

const VALID_SESSION = {
  user: { id: "user-1" },
  session: { token: "token-1" },
};

function failure(status: number) {
  return { data: null, error: { status, message: `failed with ${status}` } };
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function runProtected(queryClient: QueryClient) {
  return ProtectedRoute.options.beforeLoad?.({
    context: { queryClient },
    location: { href: "/dashboard" },
  } as never);
}

function runGuest(queryClient: QueryClient) {
  return GuestRoute.options.beforeLoad?.({ context: { queryClient } } as never);
}

function runIndex(queryClient: QueryClient) {
  return IndexRoute.options.beforeLoad?.({ context: { queryClient } } as never);
}

async function rejection(run: Promise<unknown> | unknown) {
  return Promise.resolve(run).then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("session gates", () => {
  beforeEach(() => getSession.mockReset());

  it("given a rate limited session check, when a protected page loads, then it fails without redirecting", async () => {
    getSession.mockResolvedValue(failure(429));

    const error = await rejection(runProtected(newQueryClient()));

    expect(isRedirect(error)).toBe(false);
    expect(error).toMatchObject({ status: 429 });
  });

  it("given a failing server, when a protected page loads, then it fails without redirecting", async () => {
    getSession.mockResolvedValue(failure(503));

    const error = await rejection(runProtected(newQueryClient()));

    expect(isRedirect(error)).toBe(false);
    expect(error).toMatchObject({ status: 503 });
  });

  it("given a 401, when a protected page loads, then it redirects to sign-in", async () => {
    getSession.mockResolvedValue(failure(401));

    expect(isRedirect(await rejection(runProtected(newQueryClient())))).toBe(true);
  });

  it("given no session, when a protected page loads, then it redirects to sign-in", async () => {
    getSession.mockResolvedValue({ data: null, error: null });

    expect(isRedirect(await rejection(runProtected(newQueryClient())))).toBe(true);
  });

  it("given a known session, when a refetch is rate limited, then the session survives", async () => {
    const queryClient = newQueryClient();
    getSession.mockResolvedValueOnce({ data: VALID_SESSION, error: null });
    await queryClient.fetchQuery(sessionQueryOptions);

    getSession.mockResolvedValueOnce(failure(429));
    await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey });

    expect(queryClient.getQueryData(sessionQueryOptions.queryKey)).toEqual(VALID_SESSION);
    expect(await runProtected(queryClient)).toMatchObject({ user: VALID_SESSION.user });
  });

  it("given a rate limited session check, when a guest page loads, then the form stays reachable", async () => {
    getSession.mockResolvedValue(failure(429));

    expect(await rejection(runGuest(newQueryClient()))).toBeUndefined();
  });

  it("given a failing session check, when the root loads, then it sends the visitor to the sign-in form", async () => {
    getSession.mockResolvedValue(failure(503));

    const error = await rejection(runIndex(newQueryClient()));

    expect(error).toMatchObject({ options: { to: "/sign-in" } });
  });

  it("given a signed out cache, when the post sign-in refetch fails, then the guard reads the fresh session", async () => {
    const queryClient = newQueryClient();
    getSession.mockResolvedValueOnce({ data: null, error: null });
    await queryClient.fetchQuery(sessionQueryOptions);

    getSession.mockResolvedValueOnce(failure(429));
    await refetchSession(queryClient);

    getSession.mockResolvedValueOnce({ data: VALID_SESSION, error: null });
    expect(await runProtected(queryClient)).toMatchObject({ user: VALID_SESSION.user });
  });

  it("given a known session, when the post sign-in refetch fails, then the session is kept", async () => {
    const queryClient = newQueryClient();
    getSession.mockResolvedValueOnce({ data: VALID_SESSION, error: null });
    await queryClient.fetchQuery(sessionQueryOptions);

    getSession.mockResolvedValueOnce(failure(429));
    await refetchSession(queryClient);

    expect(queryClient.getQueryData(sessionQueryOptions.queryKey)).toEqual(VALID_SESSION);
  });
});

import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setUser } from "./sentry";
import { watchSession } from "./session-watcher";

vi.mock("./sentry", () => ({
  setUser: vi.fn(),
}));

describe("watchSession", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    vi.clearAllMocks();
  });

  it("calls setUser with the user id when a session lands in the cache", () => {
    watchSession(queryClient);
    queryClient.setQueryData(["session"], { user: { id: "user-42" }, session: {} });
    expect(setUser).toHaveBeenCalledWith({ id: "user-42" });
  });

  it("calls setUser(null) on sign-out", () => {
    watchSession(queryClient);
    queryClient.setQueryData(["session"], { user: { id: "user-42" }, session: {} });
    vi.clearAllMocks();
    queryClient.setQueryData(["session"], null);
    expect(setUser).toHaveBeenCalledWith(null);
  });

  it("calls setUser(null) when the session query resolves empty on boot", () => {
    watchSession(queryClient);
    queryClient.setQueryData(["session"], null);
    expect(setUser).toHaveBeenCalledWith(null);
  });

  it("dedupes consecutive updates with the same user id", () => {
    watchSession(queryClient);
    queryClient.setQueryData(["session"], { user: { id: "user-42" }, session: {} });
    queryClient.setQueryData(["session"], { user: { id: "user-42" }, session: {} });
    expect(setUser).toHaveBeenCalledTimes(1);
  });

  it("re-identifies when the user id changes", () => {
    watchSession(queryClient);
    queryClient.setQueryData(["session"], { user: { id: "user-1" }, session: {} });
    queryClient.setQueryData(["session"], { user: { id: "user-2" }, session: {} });
    expect(setUser).toHaveBeenCalledTimes(2);
    expect(setUser).toHaveBeenLastCalledWith({ id: "user-2" });
  });

  it("ignores other queries", () => {
    watchSession(queryClient);
    queryClient.setQueryData(["orgs"], [{ id: "org-1" }]);
    expect(setUser).not.toHaveBeenCalled();
  });

  it("stops watching after unsubscribe", () => {
    const unsubscribe = watchSession(queryClient);
    unsubscribe();
    queryClient.setQueryData(["session"], { user: { id: "user-42" }, session: {} });
    expect(setUser).not.toHaveBeenCalled();
  });
});

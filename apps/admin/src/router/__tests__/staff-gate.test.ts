import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { meQueryOptions } from "../../shared/api/queries/me";
import { Route } from "../_staff";

const $get = vi.hoisted(() => vi.fn());

vi.mock("../../shared/api/api-client", () => ({
  api: { admin: { me: { $get }, "step-up": { $post: vi.fn() } } },
}));
vi.stubGlobal("window", { location: { origin: "http://admin.test" } });

const ME = { id: "staff-1", permissions: ["users.read"] };

function answer(status: number, code?: string) {
  return {
    ok: status < 400,
    status,
    headers: new Headers(),
    json: async () => (status < 400 ? ME : { error: { code, message: "refused" } }),
  };
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function runGate(queryClient: QueryClient) {
  return Promise.resolve(
    Route.options.beforeLoad?.({
      context: { queryClient },
      location: { href: "/users" },
    } as never),
  ).then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );
}

describe("the staff gate", () => {
  beforeEach(() => $get.mockReset());

  it.each([500, 429])(
    "given a shell already open, when /admin/me answers %i, then it stays open",
    async (status) => {
      const queryClient = newQueryClient();
      queryClient.setQueryData(meQueryOptions.queryKey, ME as never);
      $get.mockResolvedValue(answer(status));

      expect((await runGate(queryClient)).value).toEqual({ me: ME });
    },
  );

  it("given a shell already open, when the network fails, then it stays open", async () => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(meQueryOptions.queryKey, ME as never);
    $get.mockResolvedValue({
      get ok(): boolean {
        throw new TypeError("Failed to fetch");
      },
    });

    expect((await runGate(queryClient)).value).toEqual({ me: ME });
  });

  it("given nothing cached, when /admin/me answers 500, then it fails without redirecting", async () => {
    $get.mockResolvedValue(answer(500));

    const { error } = await runGate(newQueryClient());

    expect(isRedirect(error)).toBe(false);
    expect(error).toMatchObject({ status: 500 });
  });

  it("given a shell already open, when the session is gone, then it goes to sign-in", async () => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(meQueryOptions.queryKey, ME as never);
    $get.mockResolvedValue(answer(401));

    const { error } = await runGate(queryClient);

    expect(isRedirect(error)).toBe(true);
    expect(error).toMatchObject({ options: { reloadDocument: true } });
  });

  it.each([
    ["ADMIN_STAFF_FORBIDDEN", undefined],
    ["ADMIN_STAFF_MFA_FORBIDDEN", "mfa"],
    ["POLICY_ACCEPTANCE_REQUIRED", "policies"],
  ])("given the refusal %s, then it goes to the denied page", async (code, reason) => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(meQueryOptions.queryKey, ME as never);
    $get.mockResolvedValue(answer(403, code));

    const { error } = await runGate(queryClient);

    expect(error).toMatchObject({ options: { to: "/denied", search: { reason } } });
  });

  it("a step-up refusal is not a loss of access", async () => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(meQueryOptions.queryKey, ME as never);
    $get.mockResolvedValue(answer(403, "ADMIN_REAUTH_REQUIRED"));

    expect((await runGate(queryClient)).value).toEqual({ me: ME });
  });

  it("the query runs offline too, or the gate would wait forever", () => {
    expect(meQueryOptions.networkMode).toBe("always");
  });
});

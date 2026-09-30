import { describe, expect, it, vi } from "vitest";

const getActiveMember = vi.fn();

vi.mock("../../../auth/auth-client", () => ({
  authClient: { organization: { getActiveMember: () => getActiveMember() } },
}));

import { currentMembershipQueryOptions } from "../current-membership";

async function membership(): Promise<unknown> {
  const { queryFn } = currentMembershipQueryOptions("org-1");
  return (queryFn as (context: { signal: AbortSignal }) => Promise<unknown>)({
    signal: new AbortController().signal,
  });
}

describe("currentMembershipQueryOptions", () => {
  it("keeps a membership whose role is one of the org roles", async () => {
    getActiveMember.mockResolvedValue({ data: { userId: "u-1", role: "admin" }, error: null });

    expect(await membership()).toEqual({ userId: "u-1", role: "admin" });
  });

  it("grants nothing for a role outside the org roles", async () => {
    getActiveMember.mockResolvedValue({ data: { userId: "u-1", role: "superadmin" }, error: null });

    expect(await membership()).toBeNull();
  });
});

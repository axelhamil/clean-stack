import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const { acceptInvitation, setActive } = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  setActive: vi.fn(),
}));

vi.mock("../../../auth/auth-client", () => ({
  authClient: { organization: { acceptInvitation, setActive } },
}));

import { acceptInvitationMutationOptions } from "../accept-invitation";

describe("acceptInvitationMutationOptions", () => {
  it("activates the organization when the answer carries it flat, without the invitation", async () => {
    acceptInvitation.mockResolvedValue({ data: { organizationId: "org-1" }, error: null });
    setActive.mockResolvedValue({ error: null });

    const accept = new MutationObserver(new QueryClient(), acceptInvitationMutationOptions);

    await accept.mutate({ invitationId: "inv-1" });

    expect(setActive).toHaveBeenCalledWith({ organizationId: "org-1" });
  });
});

import { beforeEach, describe, expect, it } from "bun:test";
import { type IUseCase, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { revokeTokensOnMembershipLost } from "../../../application/event-handlers/revoke-on-membership-lost";
import type { RevokeMembershipTokensInput } from "../../../application/usecases/revoke-membership-tokens/revoke-membership-tokens.dto";

let useCase = mockPort<IUseCase<RevokeMembershipTokensInput, void, unknown>>();

function orgMemberRemoved(payload: object) {
  return {
    eventId: "evt-1",
    eventType: EventTypes.ORG_MEMBER_REMOVED,
    aggregateType: "organization",
    aggregateId: "org-1",
    payload,
    dateOccurred: new Date(),
    version: 1,
  };
}

const handle = (payload: object) =>
  revokeTokensOnMembershipLost({ RevokeMembershipTokensUseCase: useCase }).handle(
    orgMemberRemoved(payload),
  );

describe("revokeTokensOnMembershipLost", () => {
  beforeEach(() => {
    useCase = mockPort<IUseCase<RevokeMembershipTokensInput, void, unknown>>();
    useCase.execute.mockResolvedValue(Result.ok());
  });

  it("revokes the removed member's tokens of that organization on behalf of the remover", async () => {
    await handle({ organizationId: "org-1", userId: "user-1", actorUserId: "admin-1" });

    expect(useCase.execute).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
      actorUserId: "admin-1",
    });
  });

  it("throws on a failed revocation so the delivery is retried", async () => {
    useCase.execute.mockResolvedValue(
      Result.fail({ code: "API_TOKEN_PROVIDER_FAILURE", message: "db error" }),
    );

    await expect(
      handle({ organizationId: "org-1", userId: "user-1", actorUserId: "admin-1" }),
    ).rejects.toThrow("API_TOKEN_PROVIDER_FAILURE");
  });

  it("fails an event with a malformed payload without revoking", async () => {
    await expect(handle({ garbage: true })).rejects.toThrow(
      "org.member.removed has a malformed payload",
    );

    expect(useCase.execute).not.toHaveBeenCalled();
  });
});

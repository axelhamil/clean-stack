import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import type { IApiTokenRepository } from "../../../application/ports/repositories/api-token.port";
import { RevokeMembershipTokensUseCase } from "../../../application/usecases/revoke-membership-tokens/revoke-membership-tokens.usecase";

let repo = mockPort<IApiTokenRepository>();
let uow: UnitOfWorkMock = mockUnitOfWork();

const revoke = () =>
  new RevokeMembershipTokensUseCase(repo, uow.unitOfWork).execute({
    userId: "user-1",
    organizationId: "org-1",
    actorUserId: "admin-1",
  });

describe("RevokeMembershipTokensUseCase", () => {
  beforeEach(() => {
    repo = mockPort<IApiTokenRepository>();
    uow = mockUnitOfWork();
    repo.revokeAllOfUser.mockResolvedValue(Result.ok([]));
  });

  it("revokes the member's tokens of that organization and announces each with the remover as actor", async () => {
    repo.revokeAllOfUser.mockResolvedValue(
      Result.ok(
        ["tok-a", "tok-b"].map((tokenId) => ({ tokenId, organizationId: Option.some("org-1") })),
      ),
    );

    const result = await revoke();

    expect(result.isSuccess).toBe(true);
    expect(repo.revokeAllOfUser).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: Option.some("org-1"),
      reason: "membership_lost",
    });
    expect(uow.outcome()).toBe("committed");
    expect(uow.writtenEvents()).toEqual(
      ["tok-a", "tok-b"].map((tokenId) =>
        expect.objectContaining({
          eventType: EventTypes.API_TOKEN_REVOKED,
          aggregateId: tokenId,
          aggregateType: "api_token",
          organizationId: "org-1",
          payload: {
            userId: "user-1",
            actorUserId: "admin-1",
            organizationId: "org-1",
            tokenId,
            reason: "membership_lost",
          },
        }),
      ),
    );
  });

  it("announces nothing when the member held no live token there", async () => {
    const result = await revoke();

    expect(result.isSuccess).toBe(true);
    expect(uow.writtenEvents()).toEqual([]);
  });

  it("fails without announcing when the write fails", async () => {
    repo.revokeAllOfUser.mockResolvedValue(
      Result.fail({ code: "API_TOKEN_PROVIDER_FAILURE", message: "db error" }),
    );

    const result = await revoke();

    expect(result.getError().code).toBe("API_TOKEN_PROVIDER_FAILURE");
    expect(uow.writtenEvents()).toEqual([]);
  });
});

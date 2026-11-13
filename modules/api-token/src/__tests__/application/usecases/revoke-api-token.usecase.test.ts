import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import type { IApiTokenRepository } from "../../../application/ports/repositories/api-token.port";
import { RevokeApiTokenUseCase } from "../../../application/usecases/revoke-api-token/revoke-api-token.usecase";
import type { ApiToken } from "../../../domain/api-token/api-token.aggregate";
import type { TokenOwner } from "../../../domain/api-token/services/token-visibility.service";
import { apiToken, persisted } from "../../fixtures";

const IN_ACTIVE_ORG: TokenOwner = {
  kind: "orgAndPersonal",
  userId: "user-1",
  organizationId: "org-active",
};

let repo = mockPort<IApiTokenRepository>();
let uow: UnitOfWorkMock = mockUnitOfWork();

function useCase() {
  return new RevokeApiTokenUseCase(repo, uow.unitOfWork, mockInstrumentation());
}

function found(token: ApiToken) {
  repo.findByIdForOwner.mockResolvedValue(Result.ok(Option.some(token)));
  return token;
}

const revoke = (id: string, owner: TokenOwner = IN_ACTIVE_ORG) =>
  useCase().execute({ id, owner, actorUserId: "user-1" });

describe("RevokeApiTokenUseCase", () => {
  beforeEach(() => {
    repo = mockPort<IApiTokenRepository>();
    uow = mockUnitOfWork();
    repo.findByIdForOwner.mockResolvedValue(Result.ok(Option.none()));
    repo.revoke.mockImplementation(persisted(true));
  });

  it("reports a token the owner cannot reach as absent", async () => {
    const result = await revoke("tok-1", { kind: "personal", userId: "user-2" });

    expect(result.getError()).toEqual({ code: "API_TOKEN_NOT_FOUND", message: "Token not found." });
    expect(repo.revoke).not.toHaveBeenCalled();
  });

  it("revokes a personal token while an organization is active and announces it with its actor", async () => {
    const token = found(apiToken({ id: "mine-personal" }));

    const result = await revoke("mine-personal");

    expect(result.isSuccess).toBe(true);
    expect(repo.findByIdForOwner.mock.calls[0]?.[0].value).toBe("mine-personal");
    expect(token.get("revokedReason").toNull()).toBe("user");
    expect(token.get("revokedAt").isSome()).toBe(true);
    expect(repo.revoke).toHaveBeenCalledWith(token);
    expect(uow.outcome()).toBe("committed");
    expect(uow.writtenEvents()).toEqual([
      expect.objectContaining({
        eventType: EventTypes.API_TOKEN_REVOKED,
        aggregateId: "mine-personal",
        aggregateType: "api_token",
        organizationId: null,
        payload: {
          userId: "user-1",
          actorUserId: "user-1",
          organizationId: null,
          tokenId: "mine-personal",
          reason: "user",
        },
      }),
    ]);
  });

  it("writes and announces nothing when the token was revoked before", async () => {
    const token = found(apiToken({ revokedAt: Option.some(new Date("2024-06-01")) }));

    const result = await revoke("tok-1");

    expect(result.isSuccess).toBe(true);
    expect(token.get("revokedReason").isNone()).toBe(true);
    expect(repo.revoke).not.toHaveBeenCalled();
    expect(uow.writtenEvents()).toEqual([]);
  });

  it("announces nothing when a concurrent revocation won the write", async () => {
    found(apiToken());
    repo.revoke.mockResolvedValue(Result.ok(false));

    const result = await revoke("tok-1");

    expect(result.isSuccess).toBe(true);
    expect(uow.writtenEvents()).toEqual([]);
  });

  it("fails without announcing when the write fails", async () => {
    found(apiToken());
    repo.revoke.mockResolvedValue(
      Result.fail({ code: "API_TOKEN_PROVIDER_FAILURE", message: "down" }),
    );

    const result = await revoke("tok-1");

    expect(result.getError().code).toBe("API_TOKEN_PROVIDER_FAILURE");
    expect(uow.writtenEvents()).toEqual([]);
  });
});

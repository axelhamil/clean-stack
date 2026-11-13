import { describe, expect, it } from "bun:test";
import { Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type { IApiTokenRepository } from "../../../application/ports/repositories/api-token.port";
import { RevokeAllUserTokensUseCase } from "../../../application/usecases/revoke-all-user-tokens/revoke-all-user-tokens.usecase";

describe("RevokeAllUserTokensUseCase", () => {
  it("revokes inside the caller's open transaction and returns what it revoked", async () => {
    const callerTransaction = {};
    const repo = mockPort<IApiTokenRepository>();
    const seen: unknown[] = [];
    repo.revokeAllOfUser.mockImplementation(async () => {
      seen.push(UnitOfWorkContext.transaction());
      return Result.ok([{ tokenId: "tok1", organizationId: Option.some("org1") }]);
    });

    const result = await UnitOfWorkContext.run(callerTransaction, () =>
      new RevokeAllUserTokensUseCase(repo).execute({ userId: "u1" }),
    );

    expect(seen).toEqual([callerTransaction]);
    expect(repo.revokeAllOfUser).toHaveBeenCalledWith({
      userId: "u1",
      organizationId: Option.none(),
      reason: "user",
    });
    expect(result.getValue()).toEqual([{ tokenId: "tok1", organizationId: Option.some("org1") }]);
  });
});

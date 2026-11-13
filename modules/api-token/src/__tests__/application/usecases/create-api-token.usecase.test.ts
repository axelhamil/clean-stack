import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import type {
  ApiTokenError,
  IApiTokenRepository,
} from "../../../application/ports/repositories/api-token.port";
import type { ITokenHasher } from "../../../application/ports/services/token-hasher.port";
import type { CreateApiTokenInput } from "../../../application/usecases/create-api-token/create-api-token.dto";
import { CreateApiTokenUseCase } from "../../../application/usecases/create-api-token/create-api-token.usecase";
import type { ApiToken } from "../../../domain/api-token/api-token.aggregate";
import { GOLDEN_BODY, GOLDEN_RAW, PREFIX, persisted } from "../../fixtures";

const PEPPER = "a".repeat(32);

let repo = mockPort<IApiTokenRepository>();
let hasher = mockPort<ITokenHasher>();
let uow: UnitOfWorkMock = mockUnitOfWork();

function useCase() {
  return new CreateApiTokenUseCase(repo, hasher, uow.unitOfWork, mockInstrumentation(), {
    prefix: PREFIX,
    pepper: PEPPER,
    pepperVersion: 2,
    pepperPrevious: Option.none(),
    maxExpiryDays: 365,
  });
}

function input(over: Partial<CreateApiTokenInput> = {}): CreateApiTokenInput {
  return {
    userId: "u1",
    actorUserId: "u1",
    name: "ci",
    scopes: ["read:profile"],
    organizationId: null,
    expiresInDays: null,
    ...over,
  };
}

function inserted(): ApiToken {
  const [token] = repo.insert.mock.calls[0] ?? [];
  if (!token) throw new Error("nothing was inserted");

  return token;
}

describe("CreateApiTokenUseCase", () => {
  beforeEach(() => {
    repo = mockPort<IApiTokenRepository>();
    hasher = mockPort<ITokenHasher>();
    uow = mockUnitOfWork();
    repo.insert.mockImplementation(persisted(undefined));
    hasher.randomBody.mockReturnValue(GOLDEN_BODY);
    hasher.hmac.mockImplementation((raw, pepper) =>
      raw === GOLDEN_RAW && pepper === PEPPER ? "digest-under-current-pepper" : "other-digest",
    );
  });

  it("returns the raw token once and stores only its digest under the current pepper", async () => {
    const created = await useCase().execute(input());

    const { raw, token } = created.getValue();
    expect(raw).toBe(GOLDEN_RAW);
    expect(token.get("tokenHmac")).toBe("digest-under-current-pepper");
    expect(token.get("pepperVersion")).toBe(2);
    expect(token.get("tokenStart")).toBe("clean_3mJr7AoU");
    expect(inserted()).toBe(token);
    expect(JSON.stringify(token.toObject())).not.toContain(GOLDEN_RAW);
  });

  it("announces the creation with its actor and organization once the insert committed", async () => {
    const created = await useCase().execute(input({ organizationId: "org-1" }));

    const tokenId = created.getValue().token.id.value;
    expect(uow.outcome()).toBe("committed");
    expect(uow.writtenEvents()).toEqual([
      expect.objectContaining({
        eventType: EventTypes.API_TOKEN_CREATED,
        aggregateId: tokenId,
        aggregateType: "api_token",
        organizationId: "org-1",
        payload: {
          userId: "u1",
          actorUserId: "u1",
          organizationId: "org-1",
          tokenId,
          name: "ci",
          scopes: ["read:profile"],
          expiresAt: null,
        },
      }),
    ]);
  });

  it("sets the expiry the requested number of days ahead", async () => {
    const before = Date.now();

    const created = await useCase().execute(input({ expiresInDays: 30 }));

    const expiresAt = created.getValue().token.get("expiresAt").unwrap().getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(before + thirtyDays);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + thirtyDays);
  });

  it("refuses an expiry beyond the configured maximum", async () => {
    const result = await useCase().execute(input({ expiresInDays: 400 }));

    expect(result.getError()).toEqual({
      code: "API_TOKEN_EXPIRY_INVALID",
      message: "Expiry cannot exceed 365 days.",
    });
    expect(repo.insert).not.toHaveBeenCalled();
    expect(uow.writtenEvents()).toEqual([]);
  });

  it("refuses a scope outside the closed list and an empty scope list with an actionable message", async () => {
    const unknown = await useCase().execute(input({ scopes: ["admin:all"] }));
    const empty = await useCase().execute(input({ scopes: [] }));

    const refusal: ApiTokenError = {
      code: "API_TOKEN_SCOPES_INVALID",
      message: "Choose at least one scope among read:profile, write:profile, read:organizations.",
    };
    expect(unknown.getError()).toEqual(refusal);
    expect(empty.getError()).toEqual(refusal);
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("announces nothing when the insert fails", async () => {
    repo.insert.mockResolvedValue(
      Result.fail({ code: "API_TOKEN_PROVIDER_FAILURE", message: "down" }),
    );

    const result = await useCase().execute(input());

    expect(result.getError().code).toBe("API_TOKEN_PROVIDER_FAILURE");
    expect(uow.writtenEvents()).toEqual([]);
  });
});

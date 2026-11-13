import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import type {
  ApiTokenRecord,
  IApiTokenRepository,
} from "../../../application/ports/repositories/api-token.port";
import type { ITokenHasher } from "../../../application/ports/services/token-hasher.port";
import type { IUserContactReader } from "../../../application/ports/services/user-contact.port";
import { HandleLeakReportUseCase } from "../../../application/usecases/handle-leak-report/handle-leak-report.usecase";
import { RawToken } from "../../../domain/api-token/value-objects/raw-token.vo";
import { GOLDEN_RAW, PREFIX, persisted, tokenRecord } from "../../fixtures";

const PEPPER = "a".repeat(32);
const PREVIOUS_PEPPER = "b".repeat(32);
const UNKNOWN_RAW = RawToken.issue(PREFIX, "z".repeat(44)).getValue().value.raw;

const RECORD = tokenRecord({ name: "ci-token" });

let repo = mockPort<IApiTokenRepository>();
let uow: UnitOfWorkMock = mockUnitOfWork();
let email = mockPort<IEmailService>();
let users = mockPort<IUserContactReader>();
let hasher = mockPort<ITokenHasher>();

function useCase(pepperPrevious = Option.none<string>()) {
  return new HandleLeakReportUseCase(
    repo,
    hasher,
    uow.unitOfWork,
    email,
    users,
    mockInstrumentation(),
    { prefix: PREFIX, pepper: PEPPER, pepperVersion: 1, pepperPrevious, maxExpiryDays: 365 },
  );
}

function storedUnder(pepper: string, record: ApiTokenRecord) {
  repo.findByHmac.mockImplementation(async (candidate) =>
    Result.ok(candidate === `hmac(${GOLDEN_RAW},${pepper})` ? Option.some(record) : Option.none()),
  );
}

const report = (token: string) => ({ entries: [{ token, type: "clean_token" }] });

function revokedTokenId() {
  return repo.revoke.mock.calls[0]?.[0].id.value;
}

describe("HandleLeakReportUseCase", () => {
  beforeEach(() => {
    repo = mockPort<IApiTokenRepository>();
    uow = mockUnitOfWork();
    email = mockPort<IEmailService>();
    users = mockPort<IUserContactReader>();
    hasher = mockPort<ITokenHasher>();
    hasher.hmac.mockImplementation((raw, pepper) => `hmac(${raw},${pepper})`);
    repo.findByHmac.mockResolvedValue(Result.ok(Option.none()));
    repo.revoke.mockImplementation(persisted(true));
    email.sendTemplate.mockResolvedValue(Result.ok());
    users.findContact.mockResolvedValue(
      Result.ok(
        Option.some({
          email: "user@example.com",
          name: Option.some("Alice"),
          locale: Option.some("fr"),
        }),
      ),
    );
  });

  it("labels a token with the wrong format a false positive without a lookup", async () => {
    const verdicts = await useCase().execute(report("bad-format-token"));

    expect(verdicts.getValue()[0]?.label).toBe("false_positive");
    expect(repo.findByHmac).not.toHaveBeenCalled();
  });

  it("labels an unknown token a false positive and revokes nothing", async () => {
    const verdicts = await useCase().execute(report(GOLDEN_RAW));

    expect(verdicts.getValue()[0]?.label).toBe("false_positive");
    expect(repo.revoke).not.toHaveBeenCalled();
  });

  it("revokes a leaked token, announces it without an actor and warns its owner", async () => {
    storedUnder(PEPPER, RECORD);

    const verdicts = await useCase().execute(report(GOLDEN_RAW));

    expect(verdicts.getValue()[0]?.label).toBe("true_positive");
    const [revoked] = repo.revoke.mock.calls[0] ?? [];
    expect(revoked?.id.value).toBe("tok-1");
    expect(revoked?.get("revokedReason").toNull()).toBe("leaked");
    expect(uow.writtenEvents()).toEqual([
      expect.objectContaining({
        eventType: EventTypes.API_TOKEN_REVOKED,
        aggregateId: "tok-1",
        aggregateType: "api_token",
        organizationId: null,
        payload: {
          userId: "user-1",
          actorUserId: null,
          organizationId: null,
          tokenId: "tok-1",
          reason: "leaked",
        },
      }),
    ]);
    expect(email.sendTemplate).toHaveBeenCalledWith(
      "api_token_leaked",
      "user@example.com",
      expect.objectContaining({ name: "Alice", tokenName: "ci-token" }),
      { locale: "fr" },
    );
  });

  it("answers one verdict per entry, in order, mixing true and false positives", async () => {
    storedUnder(PEPPER, RECORD);

    const verdicts = await useCase().execute({
      entries: [
        { token: UNKNOWN_RAW, type: "clean_token" },
        { token: GOLDEN_RAW, type: "clean_token" },
        { token: "bad-format-token", type: "clean_token" },
      ],
    });

    expect(verdicts.getValue()).toEqual([
      { token_raw: UNKNOWN_RAW, token_type: "clean_token", label: "false_positive" },
      { token_raw: GOLDEN_RAW, token_type: "clean_token", label: "true_positive" },
      { token_raw: "bad-format-token", token_type: "clean_token", label: "false_positive" },
    ]);
    expect(repo.revoke).toHaveBeenCalledTimes(1);
    expect(uow.writtenEvents()).toHaveLength(1);
  });

  it("finds a token hashed under the previous pepper", async () => {
    storedUnder(PREVIOUS_PEPPER, tokenRecord({ id: "tok-prev" }));

    const verdicts = await useCase(Option.some(PREVIOUS_PEPPER)).execute(report(GOLDEN_RAW));

    expect(verdicts.getValue()[0]?.label).toBe("true_positive");
    expect(revokedTokenId()).toBe("tok-prev");
  });

  it("labels an already revoked token a true positive without writing or warning", async () => {
    storedUnder(PEPPER, tokenRecord({ revokedAt: Option.some(new Date("2024-06-01")) }));

    const verdicts = await useCase().execute(report(GOLDEN_RAW));

    expect(verdicts.getValue()[0]?.label).toBe("true_positive");
    expect(repo.revoke).not.toHaveBeenCalled();
    expect(email.sendTemplate).not.toHaveBeenCalled();
  });

  it("announces and warns nothing when a concurrent revocation won the write", async () => {
    storedUnder(PEPPER, RECORD);
    repo.revoke.mockResolvedValue(Result.ok(false));

    const verdicts = await useCase().execute(report(GOLDEN_RAW));

    expect(verdicts.getValue()[0]?.label).toBe("true_positive");
    expect(uow.writtenEvents()).toEqual([]);
    expect(email.sendTemplate).not.toHaveBeenCalled();
  });

  it("fails the report when the token lookup fails", async () => {
    repo.findByHmac.mockResolvedValue(
      Result.fail({ code: "API_TOKEN_PROVIDER_FAILURE", message: "down" }),
    );

    const verdicts = await useCase().execute(report(GOLDEN_RAW));

    expect(verdicts.getError().code).toBe("API_TOKEN_PROVIDER_FAILURE");
  });

  it("fails the report and announces nothing when the revocation fails", async () => {
    storedUnder(PEPPER, RECORD);
    repo.revoke.mockResolvedValue(
      Result.fail({ code: "API_TOKEN_PROVIDER_FAILURE", message: "down" }),
    );

    const verdicts = await useCase().execute(report(GOLDEN_RAW));

    expect(verdicts.getError().code).toBe("API_TOKEN_PROVIDER_FAILURE");
    expect(uow.writtenEvents()).toEqual([]);
    expect(email.sendTemplate).not.toHaveBeenCalled();
  });
});

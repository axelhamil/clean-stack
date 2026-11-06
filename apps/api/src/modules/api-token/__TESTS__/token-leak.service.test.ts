import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { generateToken, hmacToken } from "../../../shared/crypto/api-token";
import type { ApiTokenRecord, IApiTokenRepository } from "../../../shared/ports/api-token.port";
import type { IUserAccountStore } from "../../../shared/ports/user-account.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import { TokenLeakService } from "../application/services/token-leak.service";

const PREFIX = "clean_";
const PEPPER = "a".repeat(32);
const PREVIOUS_PEPPER = "b".repeat(32);

const { raw: KNOWN_RAW } = generateToken(PREFIX);

const RECORD: ApiTokenRecord = {
  id: "tok-1",
  userId: "user-1",
  organizationId: Option.none(),
  name: "ci-token",
  scopes: ["read:profile"],
  tokenHmac: hmacToken(KNOWN_RAW, PEPPER),
  pepperVersion: 1,
  tokenStart: KNOWN_RAW.slice(0, 14),
  lastUsedAt: Option.none(),
  expiresAt: Option.none(),
  revokedAt: Option.none(),
  revokedReason: Option.none(),
  createdAt: new Date("2024-01-01"),
};

let repo = mockPort<IApiTokenRepository>();
let outbox = mockPort<IOutboxRepository>();
let email = mockPort<IEmailService>();
let users = mockPort<IUserAccountStore>();

function service(pepperPrevious = Option.none<string>()) {
  return new TokenLeakService(
    repo,
    outbox,
    mockUnitOfWork().unitOfWork,
    email,
    users,
    new NoOpInstrumentation(),
    { prefix: PREFIX, pepper: PEPPER, pepperPrevious },
  );
}

function storedUnder(hmac: string, record: ApiTokenRecord) {
  repo.findByHmac.mockImplementation(async (candidate) =>
    Result.ok(candidate === hmac ? Option.some(record) : Option.none()),
  );
}

const report = (token: string) => [{ token, type: "clean_token" }];

describe("TokenLeakService.handleReport", () => {
  beforeEach(() => {
    repo = mockPort<IApiTokenRepository>();
    outbox = mockPort<IOutboxRepository>();
    email = mockPort<IEmailService>();
    users = mockPort<IUserAccountStore>();
    repo.findByHmac.mockResolvedValue(Result.ok(Option.none()));
    repo.revoke.mockResolvedValue(Result.ok(true));
    outbox.enqueue.mockResolvedValue(undefined);
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
    const verdicts = await service().handleReport(report("bad-format-token"));

    expect(verdicts.getValue()[0]?.label).toBe("false_positive");
    expect(repo.findByHmac).not.toHaveBeenCalled();
  });

  it("labels an unknown token a false positive and revokes nothing", async () => {
    const verdicts = await service().handleReport(report(KNOWN_RAW));

    expect(verdicts.getValue()[0]?.label).toBe("false_positive");
    expect(repo.revoke).not.toHaveBeenCalled();
  });

  it("revokes a leaked token, announces it without an actor and warns its owner", async () => {
    storedUnder(RECORD.tokenHmac, RECORD);

    const verdicts = await service().handleReport(report(KNOWN_RAW));

    expect(verdicts.getValue()[0]?.label).toBe("true_positive");
    expect(repo.revoke).toHaveBeenCalledWith("tok-1", "leaked");
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.API_TOKEN_REVOKED,
        aggregateId: "tok-1",
        payload: {
          userId: "user-1",
          actorUserId: null,
          organizationId: null,
          tokenId: "tok-1",
          reason: "leaked",
        },
      },
    ]);
    expect(email.sendTemplate).toHaveBeenCalledWith(
      "api_token_leaked",
      "user@example.com",
      expect.objectContaining({ name: "Alice", tokenName: "ci-token" }),
      { locale: "fr" },
    );
  });

  it("answers one verdict per entry, in order, mixing true and false positives", async () => {
    storedUnder(RECORD.tokenHmac, RECORD);
    const { raw: unknownRaw } = generateToken(PREFIX);

    const verdicts = await service().handleReport([
      { token: unknownRaw, type: "clean_token" },
      { token: KNOWN_RAW, type: "clean_token" },
      { token: "bad-format-token", type: "clean_token" },
    ]);

    expect(verdicts.getValue()).toEqual([
      { token_raw: unknownRaw, token_type: "clean_token", label: "false_positive" },
      { token_raw: KNOWN_RAW, token_type: "clean_token", label: "true_positive" },
      { token_raw: "bad-format-token", token_type: "clean_token", label: "false_positive" },
    ]);
    expect(repo.revoke).toHaveBeenCalledTimes(1);
    expect(enqueuedEvents(outbox)).toHaveLength(1);
  });

  it("finds a token hashed under the previous pepper", async () => {
    const previous = { ...RECORD, id: "tok-prev" };
    storedUnder(hmacToken(KNOWN_RAW, PREVIOUS_PEPPER), previous);

    const verdicts = await service(Option.some(PREVIOUS_PEPPER)).handleReport(report(KNOWN_RAW));

    expect(verdicts.getValue()[0]?.label).toBe("true_positive");
    expect(repo.revoke).toHaveBeenCalledWith("tok-prev", "leaked");
  });

  it("labels an already revoked token a true positive without writing or warning", async () => {
    storedUnder(RECORD.tokenHmac, { ...RECORD, revokedAt: Option.some(new Date("2024-06-01")) });

    const verdicts = await service().handleReport(report(KNOWN_RAW));

    expect(verdicts.getValue()[0]?.label).toBe("true_positive");
    expect(repo.revoke).not.toHaveBeenCalled();
    expect(email.sendTemplate).not.toHaveBeenCalled();
  });

  it("announces and warns nothing when a concurrent revocation won the write", async () => {
    storedUnder(RECORD.tokenHmac, RECORD);
    repo.revoke.mockResolvedValue(Result.ok(false));

    const verdicts = await service().handleReport(report(KNOWN_RAW));

    expect(verdicts.getValue()[0]?.label).toBe("true_positive");
    expect(enqueuedEvents(outbox)).toEqual([]);
    expect(email.sendTemplate).not.toHaveBeenCalled();
  });

  it("fails the report when the token lookup fails", async () => {
    repo.findByHmac.mockResolvedValue(
      Result.fail({ code: "API_TOKEN_PROVIDER_FAILURE", message: "down" }),
    );

    const verdicts = await service().handleReport(report(KNOWN_RAW));

    expect(verdicts.getError().code).toBe("API_TOKEN_PROVIDER_FAILURE");
  });

  it("fails the report and rolls the event back when the revocation fails", async () => {
    storedUnder(RECORD.tokenHmac, RECORD);
    repo.revoke.mockResolvedValue(
      Result.fail({ code: "API_TOKEN_PROVIDER_FAILURE", message: "down" }),
    );

    const verdicts = await service().handleReport(report(KNOWN_RAW));

    expect(verdicts.getError().code).toBe("API_TOKEN_PROVIDER_FAILURE");
    expect(enqueuedEvents(outbox)).toEqual([]);
    expect(email.sendTemplate).not.toHaveBeenCalled();
  });
});

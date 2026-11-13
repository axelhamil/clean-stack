import { describe, expect, it } from "bun:test";
import { Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { POLICY_VERSIONS } from "@packages/policies";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IPolicyAcceptanceRepository } from "../../../application/ports/repositories/policy-acceptance.port";
import type { IPolicyStatusQuery } from "../../../application/queries/policy-status.query";
import {
  type AcceptedVersions,
  policyStatusFrom,
} from "../../../application/services/policy-status.service";
import { AcceptPoliciesUseCase } from "../../../application/usecases/accept-policies/accept-policies.usecase";

const USER = "user-1";
const IP = "198.51.100.7";
const STALE_TERMS: AcceptedVersions = { privacy: POLICY_VERSIONS.privacy, terms: "2020-01-01" };

function given(accepted: AcceptedVersions = {}) {
  const repo = mockPort<IPolicyAcceptanceRepository>();
  const writeTransactions: unknown[] = [];
  repo.insert.mockImplementation(async () => {
    writeTransactions.push(UnitOfWorkContext.transaction());

    return Result.ok();
  });

  const outbox = mockPort<IOutboxRepository>();
  const emitTransactions: unknown[] = [];
  outbox.enqueue.mockImplementation(async () => {
    emitTransactions.push(UnitOfWorkContext.transaction());
  });

  const policyStatus = mockPort<IPolicyStatusQuery>();
  policyStatus.execute.mockResolvedValue(Result.ok(policyStatusFrom(accepted)));

  const { unitOfWork, outcome } = mockUnitOfWork();
  const useCase = new AcceptPoliciesUseCase(
    repo,
    policyStatus,
    outbox,
    unitOfWork,
    mockInstrumentation(),
  );

  return { repo, outbox, policyStatus, outcome, useCase, writeTransactions, emitTransactions };
}

describe("accept policies", () => {
  it("records each named policy at its current version and announces it in the same transaction", async () => {
    const { repo, outbox, useCase, writeTransactions, emitTransactions } = given();

    const result = await useCase.execute({
      userId: USER,
      types: Option.some(["privacy", "terms"]),
      ipAddress: Option.some(IP),
    });

    expect(result.isSuccess).toBe(true);
    expect(repo.insert.mock.calls.map(([row]) => [row.policyType, row.policyVersion])).toEqual([
      ["privacy", POLICY_VERSIONS.privacy],
      ["terms", POLICY_VERSIONS.terms],
    ]);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.USER_POLICY_ACCEPTED,
        aggregateId: USER,
        payload: {
          userId: USER,
          policyType: "privacy",
          policyVersion: POLICY_VERSIONS.privacy,
          ipAddress: IP,
        },
      },
      {
        eventType: EventTypes.USER_POLICY_ACCEPTED,
        aggregateId: USER,
        payload: {
          userId: USER,
          policyType: "terms",
          policyVersion: POLICY_VERSIONS.terms,
          ipAddress: IP,
        },
      },
    ]);
    expect(writeTransactions[0]).toBeDefined();
    expect(emitTransactions).toEqual(writeTransactions);
  });

  it("accepts only the stale policies when none is named", async () => {
    const { repo, outbox, useCase } = given(STALE_TERMS);

    const result = await useCase.execute({
      userId: USER,
      types: Option.none(),
      ipAddress: Option.none(),
    });

    expect(result.isSuccess).toBe(true);
    expect(repo.insert.mock.calls.map(([row]) => row.policyType)).toEqual(["terms"]);
    expect(enqueuedEvents(outbox).map((event) => event.payload)).toEqual([
      { userId: USER, policyType: "terms", policyVersion: POLICY_VERSIONS.terms },
    ]);
  });

  it("returns the policies it accepted", async () => {
    const { useCase } = given(STALE_TERMS);

    const result = await useCase.execute({
      userId: USER,
      types: Option.none(),
      ipAddress: Option.none(),
    });

    expect(result.getValue()).toEqual({ accepted: ["terms"] });
  });

  it("saves named policies even when the status cannot be read", async () => {
    const { repo, outbox, policyStatus, outcome, useCase } = given();
    policyStatus.execute.mockResolvedValue(
      Result.fail({ code: "POLICY_ACCEPTANCE_PROVIDER_FAILURE", message: "db error" }),
    );

    const result = await useCase.execute({
      userId: USER,
      types: Option.some(["terms"]),
      ipAddress: Option.none(),
    });

    expect(result.getValue()).toEqual({ accepted: ["terms"] });
    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(enqueuedEvents(outbox)).toHaveLength(1);
    expect(outcome()).toBe("committed");
  });

  it("records nothing and announces nothing when nothing is left to accept", async () => {
    const { repo, outbox, outcome, useCase } = given(POLICY_VERSIONS);

    const result = await useCase.execute({
      userId: USER,
      types: Option.none(),
      ipAddress: Option.none(),
    });

    expect(result.isSuccess).toBe(true);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
    expect(outcome()).toBe("not_started");
  });

  it("rolls back and announces nothing when a record cannot be written", async () => {
    const { repo, outbox, outcome, useCase } = given();
    repo.insert.mockResolvedValue(
      Result.fail({ code: "POLICY_ACCEPTANCE_PROVIDER_FAILURE", message: "db error" }),
    );

    const result = await useCase.execute({
      userId: USER,
      types: Option.some(["privacy"]),
      ipAddress: Option.none(),
    });

    expect(result.getError().code).toBe("POLICY_ACCEPTANCE_PROVIDER_FAILURE");
    expect(enqueuedEvents(outbox)).toEqual([]);
    expect(outcome()).toBe("rolled_back");
  });

  it("fails without writing when the stale policies cannot be read", async () => {
    const { repo, policyStatus, useCase } = given();
    policyStatus.execute.mockResolvedValue(
      Result.fail({ code: "POLICY_ACCEPTANCE_PROVIDER_FAILURE", message: "db error" }),
    );

    const result = await useCase.execute({
      userId: USER,
      types: Option.none(),
      ipAddress: Option.none(),
    });

    expect(result.getError().code).toBe("POLICY_ACCEPTANCE_PROVIDER_FAILURE");
    expect(repo.insert).not.toHaveBeenCalled();
  });
});

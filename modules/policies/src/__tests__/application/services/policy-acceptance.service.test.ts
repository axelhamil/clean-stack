import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { POLICY_VERSIONS } from "@packages/policies";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IPolicyAcceptanceRepository } from "../../../application/ports/repositories/policy-acceptance.port";
import type { IPolicyStatusQuery } from "../../../application/queries/policy-status.query";
import { PolicyAcceptanceService } from "../../../application/services/policy-acceptance.service";
import {
  type AcceptedVersions,
  policyStatusFrom,
} from "../../../application/services/policy-status.service";
import { AcceptPoliciesUseCase } from "../../../application/usecases/accept-policies/accept-policies.usecase";

function given(status: Result<AcceptedVersions, "unreadable">) {
  const policyStatus = mockPort<IPolicyStatusQuery>();
  policyStatus.execute.mockResolvedValue(
    status.isSuccess
      ? Result.ok(policyStatusFrom(status.getValue()))
      : Result.fail({ code: "POLICY_ACCEPTANCE_PROVIDER_FAILURE", message: "db error" }),
  );

  const repo = mockPort<IPolicyAcceptanceRepository>();
  repo.insert.mockResolvedValue(Result.ok());
  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockResolvedValue(undefined);

  const acceptPolicies = new AcceptPoliciesUseCase(
    repo,
    policyStatus,
    outbox,
    mockUnitOfWork().unitOfWork,
    mockInstrumentation(),
  );

  return { repo, service: new PolicyAcceptanceService(acceptPolicies, policyStatus) };
}

describe("has the user accepted the current policies", () => {
  it("answers yes when every policy is current", async () => {
    const result = await given(Result.ok(POLICY_VERSIONS)).service.hasAcceptedCurrent("user-1");

    expect(result.getValue()).toBe(true);
  });

  it("answers no when one policy is stale", async () => {
    const { service } = given(Result.ok({ privacy: POLICY_VERSIONS.privacy }));

    const result = await service.hasAcceptedCurrent("user-1");

    expect(result.getValue()).toBe(false);
  });
});

describe("accept for the auth bridge", () => {
  it("succeeds once the acceptance is saved, whatever the status read would say", async () => {
    const { repo, service } = given(Result.fail("unreadable"));

    const result = await service.accept("user-1", ["terms"]);

    expect(result.isSuccess).toBe(true);
    expect(repo.insert).toHaveBeenCalledTimes(1);
  });
});

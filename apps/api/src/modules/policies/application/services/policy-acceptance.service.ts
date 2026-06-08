import { type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { POLICY_TYPES, POLICY_VERSIONS, type PolicyType } from "@packages/policies";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type { ITransaction } from "../../../../shared/transaction";
import type { IPolicyAcceptanceStore, PolicyError } from "../ports/policy-acceptance.port";

export interface PolicyTypeStatus {
  current: boolean;
  acceptedVersion: string | null;
}

export type PolicyAcceptanceStatus = Record<PolicyType, PolicyTypeStatus>;

export class PolicyAcceptanceService {
  constructor(
    private readonly store: IPolicyAcceptanceStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork<ITransaction>,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async accept(
    userId: string,
    types: PolicyType[],
    ipAddress?: string,
  ): Promise<Result<void, PolicyError>> {
    if (types.length === 0) return Result.ok();

    let storeFailure: PolicyError | null = null;
    try {
      await this.uow.run(async (tx) => {
        for (const t of types) {
          const v = POLICY_VERSIONS[t];
          const r = await this.store.insert(
            { id: crypto.randomUUID(), userId, policyType: t, policyVersion: v, ipAddress },
            tx,
          );
          if (r.isFailure) {
            storeFailure = r.getError();
            throw new Error("rollback");
          }
          await emitEvent(
            this.outbox,
            EventTypes.USER_POLICY_ACCEPTED,
            "user",
            userId,
            { userId, policyType: t, policyVersion: v, ipAddress },
            {},
            tx,
          );
        }
      });
      return Result.ok();
    } catch (err) {
      if (storeFailure) return Result.fail(storeFailure);
      this.instrumentation.capture(err);
      return Result.fail({
        code: "POLICY_ACCEPTANCE_PROVIDER_FAILURE",
        message: "policy acceptance failed",
        metadata: { cause: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  async getStatus(userId: string): Promise<Result<PolicyAcceptanceStatus, PolicyError>> {
    const r = await this.store.findLatestVersions(userId);
    if (r.isFailure) return Result.fail(r.getError());
    const latest = r.getValue();
    const status = {} as PolicyAcceptanceStatus;
    for (const t of POLICY_TYPES) {
      const acceptedVersion = latest[t] ?? null;
      status[t] = {
        current: acceptedVersion === POLICY_VERSIONS[t],
        acceptedVersion,
      };
    }
    return Result.ok(status);
  }

  async getStaleTypes(userId: string): Promise<Result<PolicyType[], PolicyError>> {
    const r = await this.getStatus(userId);
    if (r.isFailure) return Result.fail(r.getError());
    const stale = POLICY_TYPES.filter((t) => !r.getValue()[t].current);
    return Result.ok(stale);
  }

  async hasAcceptedCurrent(userId: string): Promise<Result<boolean, PolicyError>> {
    const r = await this.getStaleTypes(userId);
    if (r.isFailure) return Result.fail(r.getError());
    return Result.ok(r.getValue().length === 0);
  }
}

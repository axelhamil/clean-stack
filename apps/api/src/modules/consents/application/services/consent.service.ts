import {
  CONSENT_GRANT_TTL_DAYS,
  CONSENT_REFUSAL_TTL_DAYS,
  COOKIE_CONSENT_VERSION,
  type ConsentCategory,
} from "@packages/cookie-consent";
import { type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type { ITransaction } from "../../../../shared/transaction";
import type { ConsentError, ConsentRecordRow, IConsentStore } from "../ports/consent.port";

export interface RecordConsentInput {
  subjectId: string;
  userId?: string;
  categories: ConsentCategory[];
  ip?: string;
  ua?: string;
}

export interface WithdrawConsentInput {
  subjectId: string;
  userId?: string;
}

export class ConsentService {
  constructor(
    private readonly store: IConsentStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork<ITransaction>,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async record(input: RecordConsentInput): Promise<Result<ConsentRecordRow, ConsentError>> {
    const { subjectId, userId, categories, ip, ua } = input;

    const allCategories: ConsentCategory[] = categories.includes("necessary")
      ? categories
      : ["necessary", ...categories];

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CONSENT_GRANT_TTL_DAYS * 24 * 60 * 60 * 1000);
    const row: ConsentRecordRow = {
      id: crypto.randomUUID(),
      subjectId,
      userId,
      categories: allCategories,
      policyVersion: COOKIE_CONSENT_VERSION,
      grantedAt: now,
      expiresAt,
      ipAddress: ip,
      userAgent: ua,
    };

    let storeFailure: ConsentError | null = null;
    try {
      await this.uow.run(async (tx) => {
        const r = await this.store.insert(row, tx);
        if (r.isFailure) {
          storeFailure = r.getError();
          throw new Error("rollback");
        }
        await emitEvent(
          this.outbox,
          EventTypes.USER_COOKIE_CONSENT_GRANTED,
          "user",
          userId ?? subjectId,
          {
            userId,
            subjectId,
            categories: allCategories,
            policyVersion: COOKIE_CONSENT_VERSION,
            ipAddress: ip,
            userAgent: ua,
          },
          {},
          tx,
        );
      });
      return Result.ok(row);
    } catch (err) {
      if (storeFailure) return Result.fail(storeFailure);
      this.instrumentation.capture(err);
      return Result.fail({
        code: "CONSENT_PROVIDER_FAILURE",
        message: "consent record failed",
        metadata: { cause: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  async withdraw(input: WithdrawConsentInput): Promise<Result<void, ConsentError>> {
    const { subjectId, userId } = input;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CONSENT_REFUSAL_TTL_DAYS * 24 * 60 * 60 * 1000);
    const row: ConsentRecordRow = {
      id: crypto.randomUUID(),
      subjectId,
      userId,
      categories: [],
      policyVersion: COOKIE_CONSENT_VERSION,
      grantedAt: now,
      withdrawnAt: now,
      expiresAt,
    };

    let storeFailure: ConsentError | null = null;
    try {
      await this.uow.run(async (tx) => {
        const r = await this.store.insert(row, tx);
        if (r.isFailure) {
          storeFailure = r.getError();
          throw new Error("rollback");
        }
        await emitEvent(
          this.outbox,
          EventTypes.USER_COOKIE_CONSENT_WITHDRAWN,
          "user",
          userId ?? subjectId,
          {
            userId,
            subjectId,
            categories: [],
            policyVersion: COOKIE_CONSENT_VERSION,
          },
          {},
          tx,
        );
      });
      return Result.ok();
    } catch (err) {
      if (storeFailure) return Result.fail(storeFailure);
      this.instrumentation.capture(err);
      return Result.fail({
        code: "CONSENT_PROVIDER_FAILURE",
        message: "consent withdraw failed",
        metadata: { cause: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  async getActive(
    subjectId: string,
    policyVersion: string,
    userId?: string,
  ): Promise<Result<ConsentRecordRow | null, ConsentError>> {
    if (userId) {
      const byUser = await this.store.findActiveByUser(userId, policyVersion);
      if (byUser.isFailure || byUser.getValue() !== null) return byUser;
    }
    return this.store.findActiveBySubject(subjectId, policyVersion);
  }

  async reconcile(subjectId: string, userId: string): Promise<Result<void, ConsentError>> {
    return this.store.linkSubjectToUser(subjectId, userId);
  }
}

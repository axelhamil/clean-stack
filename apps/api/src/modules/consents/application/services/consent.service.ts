import {
  CONSENT_GRANT_TTL_DAYS,
  CONSENT_REFUSAL_TTL_DAYS,
  COOKIE_CONSENT_VERSION,
  type ConsentCategory,
} from "@packages/cookie-consent";
import { type IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import {
  type EventType,
  EventTypes,
  type UserCookieConsentGrantedPayload,
  type UserCookieConsentWithdrawnPayload,
} from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type { ITransaction } from "../../../../shared/transaction";
import type { ConsentError, ConsentRecordRow, IConsentStore } from "../ports/consent.port";

const DAY_MS = 24 * 60 * 60 * 1000;

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

function daysAfter(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
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
    const row: ConsentRecordRow = {
      id: crypto.randomUUID(),
      subjectId,
      userId: Option.fromNullable(userId),
      categories: allCategories,
      policyVersion: COOKIE_CONSENT_VERSION,
      grantedAt: now,
      withdrawnAt: Option.none(),
      expiresAt: daysAfter(now, CONSENT_GRANT_TTL_DAYS),
      ipAddress: Option.fromNullable(ip),
      userAgent: Option.fromNullable(ua),
    };

    const appended = await this.append(
      row,
      EventTypes.USER_COOKIE_CONSENT_GRANTED,
      {
        userId,
        subjectId,
        categories: allCategories,
        policyVersion: COOKIE_CONSENT_VERSION,
        ipAddress: ip,
        userAgent: ua,
      },
      "consent record failed",
    );
    if (appended.isFailure) return Result.fail(appended.getError());

    return Result.ok(row);
  }

  async withdraw(input: WithdrawConsentInput): Promise<Result<void, ConsentError>> {
    const { subjectId, userId } = input;

    const now = new Date();
    const row: ConsentRecordRow = {
      id: crypto.randomUUID(),
      subjectId,
      userId: Option.fromNullable(userId),
      categories: [],
      policyVersion: COOKIE_CONSENT_VERSION,
      grantedAt: now,
      withdrawnAt: Option.some(now),
      expiresAt: daysAfter(now, CONSENT_REFUSAL_TTL_DAYS),
      ipAddress: Option.none(),
      userAgent: Option.none(),
    };

    return this.append(
      row,
      EventTypes.USER_COOKIE_CONSENT_WITHDRAWN,
      { userId, subjectId, categories: [], policyVersion: COOKIE_CONSENT_VERSION },
      "consent withdraw failed",
    );
  }

  async getActive(
    subjectId: string,
    policyVersion: string,
    userId?: string,
  ): Promise<Result<Option<ConsentRecordRow>, ConsentError>> {
    if (userId) {
      const byUser = await this.store.findActiveByUser(userId, policyVersion);
      if (byUser.isFailure || byUser.getValue().isSome()) return byUser;
    }

    return this.store.findActiveBySubject(subjectId, policyVersion);
  }

  async reconcile(subjectId: string, userId: string): Promise<Result<void, ConsentError>> {
    return this.store.linkSubjectToUser(subjectId, userId);
  }

  private async append(
    row: ConsentRecordRow,
    eventType: EventType,
    payload: UserCookieConsentGrantedPayload | UserCookieConsentWithdrawnPayload,
    failureMessage: string,
  ): Promise<Result<void, ConsentError>> {
    try {
      return await this.uow.run(async (tx) => {
        const inserted = await this.store.insert(row, tx);
        if (inserted.isFailure) return inserted;

        await emitEvent(
          this.outbox,
          eventType,
          "user",
          payload.userId ?? payload.subjectId,
          payload,
          {},
          tx,
        );

        return inserted;
      });
    } catch (err) {
      this.instrumentation.capture(err);
      return Result.fail({
        code: "CONSENT_PROVIDER_FAILURE",
        message: failureMessage,
        metadata: { cause: err instanceof Error ? err.message : String(err) },
      });
    }
  }
}

import { CONSENT_REFUSAL_TTL_DAYS, COOKIE_CONSENT_VERSION } from "@packages/cookie-consent";
import { type IUseCase, Option, type Result } from "@packages/ddd-kit";
import { consentWithdrawnEvent } from "../../events/consent-withdrawn.event";
import type { ConsentError, ConsentRecord } from "../../ports/repositories/consent.port";
import { type ConsentLedger, daysAfter } from "../../services/consent-ledger.service";
import type { WithdrawConsentInput } from "./withdraw-consent.dto";

export class WithdrawConsentUseCase implements IUseCase<WithdrawConsentInput, void, ConsentError> {
  constructor(private readonly ledger: ConsentLedger) {}

  execute(input: WithdrawConsentInput): Promise<Result<void, ConsentError>> {
    const now = new Date();
    const record: ConsentRecord = {
      id: crypto.randomUUID(),
      subjectId: input.subjectId,
      userId: input.userId,
      categories: [],
      policyVersion: COOKIE_CONSENT_VERSION,
      grantedAt: now,
      withdrawnAt: Option.some(now),
      expiresAt: daysAfter(now, CONSENT_REFUSAL_TTL_DAYS),
      ipAddress: Option.none(),
      userAgent: Option.none(),
    };

    const event = consentWithdrawnEvent({
      userId: input.userId.toUndefined(),
      subjectId: input.subjectId,
      categories: [],
      policyVersion: COOKIE_CONSENT_VERSION,
    });

    return this.ledger.append(record, event, "consent withdraw failed");
  }
}

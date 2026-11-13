import {
  CONSENT_GRANT_TTL_DAYS,
  COOKIE_CONSENT_VERSION,
  type ConsentCategory,
} from "@packages/cookie-consent";
import { type IUseCase, Option, Result } from "@packages/ddd-kit";
import { consentGrantedEvent } from "../../events/consent-granted.event";
import type { ConsentError, ConsentRecord } from "../../ports/repositories/consent.port";
import { type ConsentLedger, daysAfter } from "../../services/consent-ledger.service";
import type { RecordConsentInput, RecordConsentOutput } from "./record-consent.dto";

export class RecordConsentUseCase
  implements IUseCase<RecordConsentInput, RecordConsentOutput, ConsentError>
{
  constructor(private readonly ledger: ConsentLedger) {}

  async execute(input: RecordConsentInput): Promise<Result<RecordConsentOutput, ConsentError>> {
    const subjectId = input.subjectId.unwrapOrElse(() => crypto.randomUUID());
    const categories: ConsentCategory[] = input.categories.includes("necessary")
      ? input.categories
      : ["necessary", ...input.categories];

    const now = new Date();
    const record: ConsentRecord = {
      id: crypto.randomUUID(),
      subjectId,
      userId: input.userId,
      categories,
      policyVersion: COOKIE_CONSENT_VERSION,
      grantedAt: now,
      withdrawnAt: Option.none(),
      expiresAt: daysAfter(now, CONSENT_GRANT_TTL_DAYS),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };

    const event = consentGrantedEvent({
      userId: input.userId.toUndefined(),
      subjectId,
      categories,
      policyVersion: COOKIE_CONSENT_VERSION,
      ipAddress: input.ipAddress.toUndefined(),
      userAgent: input.userAgent.toUndefined(),
    });

    const appended = await this.ledger.append(record, event, "consent record failed");
    if (appended.isFailure) return Result.fail(appended.getError());

    return Result.ok({ subjectId, categories, policyVersion: COOKIE_CONSENT_VERSION });
  }
}

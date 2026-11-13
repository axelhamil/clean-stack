import { COOKIE_CONSENT_VERSION } from "@packages/cookie-consent";
import type { Option, Result } from "@packages/ddd-kit";
import type {
  ConsentError,
  ConsentRecord,
  IConsentRepository,
} from "../../application/ports/repositories/consent.port";
import type {
  GetActiveConsentInput,
  IGetActiveConsentQuery,
} from "../../application/queries/get-active-consent.query";

export class LedgerActiveConsentQuery implements IGetActiveConsentQuery {
  constructor(private readonly repository: IConsentRepository) {}

  async execute(
    input: GetActiveConsentInput,
  ): Promise<Result<Option<ConsentRecord>, ConsentError>> {
    if (input.userId.isSome()) {
      const byUser = await this.repository.findActiveByUser(
        input.userId.unwrap(),
        COOKIE_CONSENT_VERSION,
      );
      if (byUser.isFailure || byUser.getValue().isSome()) return byUser;
    }

    return this.repository.findActiveBySubject(input.subjectId, COOKIE_CONSENT_VERSION);
  }
}

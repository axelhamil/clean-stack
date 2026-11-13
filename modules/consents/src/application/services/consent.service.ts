import type { Result } from "@packages/ddd-kit";
import type { ConsentError } from "../ports/repositories/consent.port";
import type { ReconcileConsentUseCase } from "../usecases/reconcile-consent/reconcile-consent.usecase";

export class ConsentService {
  constructor(private readonly reconcileConsent: ReconcileConsentUseCase) {}

  reconcile(subjectId: string, userId: string): Promise<Result<void, ConsentError>> {
    return this.reconcileConsent.execute({ subjectId, userId });
  }
}

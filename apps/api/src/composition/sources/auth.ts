import type { StaffService } from "@modules/admin/services/staff";
import type { IStripeEventStore } from "@modules/billing/ports/stripe-event";
import type { IGetEntitlementsQuery } from "@modules/billing/queries/get-entitlements";
import type { IGetPlanCatalogQuery } from "@modules/billing/queries/get-plan-catalog";
import type { VerifyStripeSyncUseCase } from "@modules/billing/usecases/verify-stripe-sync";
import type { ConsentService } from "@modules/consents/services/consent";
import type { PolicyAcceptanceService } from "@modules/policies/services/policy-acceptance";
import type { IGetLocaleByEmailQuery } from "@modules/profile/queries/get-locale-by-email";
import type { ILogger, IUnitOfWork } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type Stripe from "stripe";
import type { AuthDeps, AuthSettings } from "../../auth/deps";
import type {
  IConsentReconciler,
  IPolicyAcceptance,
  ISecuritySignals,
  IStaffSessionEnder,
} from "../../auth/ports";
import type { AuthQueries } from "../../auth/queries";
import type { OutermostUnitOfWork } from "../../auth/unit-of-work-adapter";
import type { IDisposableEmailService } from "../../shared/ports/disposable-email.port";
import type { IPasswordBreachService } from "../../shared/ports/password-breach.port";
import type { IRateLimiter } from "../../shared/ports/rate-limiter.port";
import type { ITotpVerifier } from "../../shared/ports/totp-verifier.port";
import type { SecuritySignalsService } from "../../shared/services/security-signals.service";

export interface AuthSourcesPrerequisites {
  ITransactionService: IUnitOfWork & OutermostUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IEmailService: IEmailService;
  IGetLocaleByEmailQuery: IGetLocaleByEmailQuery;
  IRateLimiter: IRateLimiter;
  IDisposableEmailService: IDisposableEmailService;
  IPasswordBreachService: IPasswordBreachService;
  ITotpVerifier: ITotpVerifier;
  IGetEntitlementsQuery: IGetEntitlementsQuery;
  IStripeEventStore: IStripeEventStore;
  StripeClient: Stripe;
  ILogger: ILogger;
  AuthQueries: AuthQueries;
  authSettings: AuthSettings;
  SecuritySignalsService: SecuritySignalsService;
  StaffService: StaffService;
  PolicyAcceptanceService: PolicyAcceptanceService;
  ConsentService: ConsentService;
  IGetPlanCatalogQuery: IGetPlanCatalogQuery;
  VerifyStripeSyncUseCase: VerifyStripeSyncUseCase;
}

export const authSources = defineModule<AuthSourcesPrerequisites>()((b) =>
  b
    .add("ISecuritySignals", (c): ISecuritySignals => c.SecuritySignalsService)
    .add("IPolicyAcceptance", (c): IPolicyAcceptance => c.PolicyAcceptanceService)
    .add("IConsentReconciler", (c): IConsentReconciler => c.ConsentService)
    .add("IStaffSessionEnder", (c): IStaffSessionEnder => c.StaffService)
    .add(
      "authDeps",
      (c): AuthDeps => ({
        uow: c.ITransactionService,
        outbox: c.IOutboxRepository,
        email: c.IEmailService,
        profiles: c.IGetLocaleByEmailQuery,
        rateLimiter: c.IRateLimiter,
        disposableEmail: c.IDisposableEmailService,
        passwordBreach: c.IPasswordBreachService,
        totp: c.ITotpVerifier,
        entitlements: c.IGetEntitlementsQuery,
        stripeEvents: c.IStripeEventStore,
        stripeClient: c.StripeClient,
        plans: c.IGetPlanCatalogQuery,
        stripeSync: c.VerifyStripeSyncUseCase,
        policies: c.IPolicyAcceptance,
        consents: c.IConsentReconciler,
        staffSessions: c.IStaffSessionEnder,
        securitySignals: c.ISecuritySignals,
        logger: c.ILogger,
        queries: c.AuthQueries,
        settings: c.authSettings,
      }),
    ),
);

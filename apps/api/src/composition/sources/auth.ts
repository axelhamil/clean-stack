import type { StaffService } from "@modules/admin/application/services/staff.service";
import type { IEntitlementsReader } from "@modules/billing/application/ports/entitlements-reader.port";
import type { IStripeEventStore } from "@modules/billing/application/ports/stripe-event.port";
import type { BillingCatalogService } from "@modules/billing/application/services/billing-catalog.service";
import type { StripeSyncVerifier } from "@modules/billing/infrastructure/adapters/stripe-sync-verifier";
import type { ConsentService } from "@modules/consents/application/services/consent.service";
import type { PolicyAcceptanceService } from "@modules/policies/application/services/policy-acceptance.service";
import type { IProfileStore } from "@modules/profile/application/ports/profile.port";
import type { ILogger, IUnitOfWork } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type Stripe from "stripe";
import type { AuthDeps, AuthSettings } from "../../auth/deps";
import type {
  IConsentReconciler,
  IPlanCatalog,
  IPolicyAcceptance,
  ISecuritySignals,
  IStaffSessionEnder,
  IStripeSyncCheck,
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
  IProfileStore: IProfileStore;
  IRateLimiter: IRateLimiter;
  IDisposableEmailService: IDisposableEmailService;
  IPasswordBreachService: IPasswordBreachService;
  ITotpVerifier: ITotpVerifier;
  EntitlementsService: IEntitlementsReader;
  IStripeEventStore: IStripeEventStore;
  StripeClient: Stripe;
  ILogger: ILogger;
  AuthQueries: AuthQueries;
  authSettings: AuthSettings;
  SecuritySignalsService: SecuritySignalsService;
  StaffService: StaffService;
  PolicyAcceptanceService: PolicyAcceptanceService;
  ConsentService: ConsentService;
  BillingCatalogService: BillingCatalogService;
  StripeSyncVerifier: StripeSyncVerifier;
}

export const authSources = defineModule<AuthSourcesPrerequisites>()((b) =>
  b
    .add("ISecuritySignals", (c): ISecuritySignals => c.SecuritySignalsService)
    .add("IPlanCatalog", (c): IPlanCatalog => c.BillingCatalogService)
    .add("IStripeSyncCheck", (c): IStripeSyncCheck => c.StripeSyncVerifier)
    .add("IPolicyAcceptance", (c): IPolicyAcceptance => c.PolicyAcceptanceService)
    .add("IConsentReconciler", (c): IConsentReconciler => c.ConsentService)
    .add("IStaffSessionEnder", (c): IStaffSessionEnder => c.StaffService)
    .add(
      "authDeps",
      (c): AuthDeps => ({
        uow: c.ITransactionService,
        outbox: c.IOutboxRepository,
        email: c.IEmailService,
        profiles: c.IProfileStore,
        rateLimiter: c.IRateLimiter,
        disposableEmail: c.IDisposableEmailService,
        passwordBreach: c.IPasswordBreachService,
        totp: c.ITotpVerifier,
        entitlements: c.EntitlementsService,
        stripeEvents: c.IStripeEventStore,
        stripeClient: c.StripeClient,
        plans: c.IPlanCatalog,
        stripeSync: c.IStripeSyncCheck,
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

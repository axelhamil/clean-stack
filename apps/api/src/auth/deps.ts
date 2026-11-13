import type { VerifyStripeSync } from "@modules/billing/adapters/stripe-sync-event";
import type { IStripeEventStore } from "@modules/billing/ports/stripe-event";
import type { IGetEntitlementsQuery } from "@modules/billing/queries/get-entitlements";
import type { IGetPlanCatalogQuery } from "@modules/billing/queries/get-plan-catalog";
import type { IGetLocaleByEmailQuery } from "@modules/profile/queries/get-locale-by-email";
import type { ILogger, IUnitOfWork } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type Stripe from "stripe";
import type { IDisposableEmailService } from "../shared/ports/disposable-email.port";
import type { IPasswordBreachService } from "../shared/ports/password-breach.port";
import type { IRateLimiter } from "../shared/ports/rate-limiter.port";
import type { ITotpVerifier } from "../shared/ports/totp-verifier.port";
import type { VersionedAuthSecret } from "./auth-secrets";
import type {
  IConsentReconciler,
  IPolicyAcceptance,
  ISecuritySignals,
  IStaffSessionEnder,
} from "./ports";
import type { AuthQueries } from "./queries";
import type { OutermostUnitOfWork } from "./unit-of-work-adapter";

export interface AuthSettings {
  appUrl: string;
  adminUrl: string | undefined;
  baseUrl: string;
  secret: string;
  secrets: VersionedAuthSecret[] | undefined;
  cookieDomain: string | undefined;
  production: boolean;
  trustedOrigins: string[];
  platformAdminIds: string[];
  stripeWebhookSecret: string;
  scimCredentialHashSecret: string;
  signInAccount: { windowSec: number; maxRequests: number };
  disposableEmailBlockEnabled: boolean;
}

export interface AuthDeps {
  uow: IUnitOfWork & OutermostUnitOfWork;
  outbox: IOutboxRepository;
  email: IEmailService;
  profiles: IGetLocaleByEmailQuery;
  rateLimiter: IRateLimiter;
  disposableEmail: IDisposableEmailService;
  passwordBreach: IPasswordBreachService;
  totp: ITotpVerifier;
  entitlements: IGetEntitlementsQuery;
  stripeEvents: IStripeEventStore;
  stripeClient: Stripe;
  plans: IGetPlanCatalogQuery;
  stripeSync: VerifyStripeSync;
  policies: IPolicyAcceptance;
  consents: IConsentReconciler;
  staffSessions: IStaffSessionEnder;
  securitySignals: ISecuritySignals;
  logger: ILogger;
  queries: AuthQueries;
  settings: AuthSettings;
}

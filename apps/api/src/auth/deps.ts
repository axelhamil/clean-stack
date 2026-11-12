import type { IEntitlementsReader } from "@modules/billing/application/ports/entitlements-reader.port";
import type { IStripeEventStore } from "@modules/billing/application/ports/stripe-event.port";
import type { ILogger, IUnitOfWork } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type Stripe from "stripe";
import type { VersionedAuthSecret } from "../shared/auth/auth-secrets";
import type { OutermostUnitOfWork } from "../shared/auth/unit-of-work-adapter";
import type { IDisposableEmailService } from "../shared/ports/disposable-email.port";
import type { IPasswordBreachService } from "../shared/ports/password-breach.port";
import type { IProfileStore } from "../shared/ports/profile.port";
import type { IRateLimiter } from "../shared/ports/rate-limiter.port";
import type { ITotpVerifier } from "../shared/ports/totp-verifier.port";
import type {
  IConsentReconciler,
  IPlanCatalog,
  IPolicyAcceptance,
  ISecuritySignals,
  IStaffSessionEnder,
  IStripeSyncCheck,
} from "./ports";

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
  profiles: IProfileStore;
  rateLimiter: IRateLimiter;
  disposableEmail: IDisposableEmailService;
  passwordBreach: IPasswordBreachService;
  totp: ITotpVerifier;
  entitlements: IEntitlementsReader;
  stripeEvents: IStripeEventStore;
  stripeClient: Stripe;
  plans: IPlanCatalog;
  stripeSync: IStripeSyncCheck;
  policies: IPolicyAcceptance;
  consents: IConsentReconciler;
  staffSessions: IStaffSessionEnder;
  securitySignals: ISecuritySignals;
  logger: ILogger;
  settings: AuthSettings;
}

import type { IStripeEventStore } from "@modules/billing/ports/stripe-event";
import type { IGetEntitlementsQuery } from "@modules/billing/queries/get-entitlements";
import type { IGetPlanCatalogQuery } from "@modules/billing/queries/get-plan-catalog";
import { ENTITLEMENTS } from "@modules/billing/rules/entitlements";
import type { IGetLocaleByEmailQuery } from "@modules/profile/queries/get-locale-by-email";
import { type ILogger, type IUnitOfWork, NoOpInstrumentation, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import Stripe from "stripe";
import type { AuthDeps, AuthSettings } from "../auth/deps";
import type {
  IConsentReconciler,
  IPolicyAcceptance,
  ISecuritySignals,
  IStaffSessionEnder,
} from "../auth/ports";
import { type AuthQueries, createAuthQueries } from "../auth/queries";
import type { OutermostUnitOfWork } from "../auth/unit-of-work-adapter";
import type { IDisposableEmailService } from "../shared/ports/disposable-email.port";
import type { IPasswordBreachService } from "../shared/ports/password-breach.port";
import type { IRateLimiter } from "../shared/ports/rate-limiter.port";
import type { ITotpVerifier } from "../shared/ports/totp-verifier.port";

const TEST_SETTINGS: AuthSettings = {
  appUrl: "http://localhost:5173",
  adminUrl: undefined,
  baseUrl: "http://localhost:3000",
  secret: "test-only-better-auth-secret-0123456789abcdef",
  secrets: undefined,
  cookieDomain: undefined,
  production: false,
  trustedOrigins: ["http://localhost:5173"],
  platformAdminIds: [],
  stripeWebhookSecret: "",
  scimCredentialHashSecret: "test-only-scim-credential-secret-0123456789",
  signInAccount: { windowSec: 900, maxRequests: 5 },
  disposableEmailBlockEnabled: true,
};

export function outermostUnitOfWork(unitOfWork: IUnitOfWork): IUnitOfWork & OutermostUnitOfWork {
  return {
    run: (work) => unitOfWork.run(work),
    runOutermost: (work) => unitOfWork.run(work),
  };
}

function freePlanEntitlements(): IGetEntitlementsQuery {
  const entitlements = mockPort<IGetEntitlementsQuery>();
  entitlements.execute.mockImplementation(async () =>
    Result.ok({
      ...ENTITLEMENTS.free,
      tier: "free",
      status: "free",
      hasSubscription: false,
    }),
  );

  return entitlements;
}

function emptyPlanCatalog(): IGetPlanCatalogQuery {
  const plans = mockPort<IGetPlanCatalogQuery>();
  plans.execute.mockImplementation(async () => Result.ok([]));

  return plans;
}

export function fakeAuthQueries(overrides: Partial<AuthQueries> = {}): AuthQueries {
  return { ...createAuthQueries(new NoOpInstrumentation()), ...overrides };
}

export function fakeAuthDeps(overrides: Partial<AuthDeps> = {}): AuthDeps {
  return {
    uow: outermostUnitOfWork(mockUnitOfWork().unitOfWork),
    outbox: mockPort<IOutboxRepository>(),
    email: mockPort<IEmailService>(),
    profiles: mockPort<IGetLocaleByEmailQuery>(),
    rateLimiter: mockPort<IRateLimiter>(),
    disposableEmail: mockPort<IDisposableEmailService>(),
    passwordBreach: mockPort<IPasswordBreachService>(),
    totp: mockPort<ITotpVerifier>(),
    entitlements: freePlanEntitlements(),
    stripeEvents: mockPort<IStripeEventStore>(),
    stripeClient: new Stripe("sk_test_fake"),
    plans: emptyPlanCatalog(),
    stripeSync: mockPort<AuthDeps["stripeSync"]>(),
    policies: mockPort<IPolicyAcceptance>(),
    consents: mockPort<IConsentReconciler>(),
    staffSessions: mockPort<IStaffSessionEnder>(),
    securitySignals: mockPort<ISecuritySignals>(),
    logger: mockPort<ILogger>(),
    queries: fakeAuthQueries(),
    settings: TEST_SETTINGS,
    ...overrides,
  };
}

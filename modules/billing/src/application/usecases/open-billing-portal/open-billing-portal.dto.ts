import type { AppError } from "@packages/ddd-kit";
import type { BillingError } from "../../ports/repositories/subscription-read.port";

export interface OpenBillingPortalInput {
  organizationId: string;
  returnUrl: string;
}

export interface OpenBillingPortalOutput {
  url: string;
}

export type BillingPortalError = BillingError | AppError<"BILLING_NOT_FOUND">;

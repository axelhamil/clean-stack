import { hc } from "hono/client";
import type { AppType } from "./app";

export type ApiClient = ReturnType<typeof hc<AppType>>;

export const hcWithType = (...args: Parameters<typeof hc<AppType>>): ApiClient =>
  hc<AppType>(...args);

export type { StripeEventStatus } from "@modules/admin/ports/stripe-event";
export type { SweepOutcome } from "@packages/http/sweep-run.port";

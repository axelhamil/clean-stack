import { hc } from "hono/client";
import type { AppType } from "./app";

export type ApiClient = ReturnType<typeof hc<AppType>>;

export const hcWithType = (...args: Parameters<typeof hc<AppType>>): ApiClient =>
  hc<AppType>(...args);

export type { StripeEventStatus } from "./shared/ports/stripe-event.port";
export type { SweepOutcome } from "./shared/ports/sweep-run.port";

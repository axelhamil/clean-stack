import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";

interface SweepRunItem {
  label: string;
  startedAt: string;
  finishedAt: string;
  outcome: "ok" | "truncated" | "batch-error" | "failed";
  durationMs: number;
  count: number;
}

interface StripeEventItem {
  id: string;
  type: string;
  status: "processed" | "failed";
  receivedAt: string;
  lastError: string | null;
  replayedAt: string | null;
}

const $deadLetters = api.admin.ops["dead-letters"].$get;
const $sweeps = api.admin.ops.sweeps.$get;
const $stripeEvents = api.admin.ops["stripe-events"].$get;

export const deadLettersQueryOptions = queryOptions({
  queryKey: ["admin", "ops", "dead-letters"] as const,
  queryFn: async ({ signal }) => {
    const res = await $deadLetters({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadDeadLetters");

    return res.json();
  },
});

export const sweepsQueryOptions = queryOptions({
  queryKey: ["admin", "ops", "sweeps"] as const,
  queryFn: async ({ signal }): Promise<{ items: SweepRunItem[] }> => {
    const res = await $sweeps({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadSweeps");

    return res.json();
  },
});

export const stripeEventsQueryOptions = queryOptions({
  queryKey: ["admin", "ops", "stripe-events"] as const,
  queryFn: async ({ signal }): Promise<{ configured: boolean; items: StripeEventItem[] }> => {
    const res = await $stripeEvents({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadStripeEvents");

    return res.json();
  },
});

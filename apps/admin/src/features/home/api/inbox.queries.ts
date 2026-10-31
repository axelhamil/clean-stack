import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";

interface InboxResponse {
  approvals: {
    total: number;
    items: { id: string; action: string; requestedBy: string; createdAt: string }[];
  } | null;
  operations: {
    deadEvents: number;
    deadEmails: number;
    deadWebhooks: number;
    failedSweeps: { label: string; outcome: string; finishedAt: string }[];
  } | null;
}

const $inbox = api.admin.inbox.$get;

export const inboxQueryOptions = queryOptions({
  queryKey: ["admin", "inbox"] as const,
  staleTime: 0,
  queryFn: async ({ signal }): Promise<InboxResponse> => {
    const res = await $inbox({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadInbox");

    return res.json();
  },
});

import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";

const $inbox = api.admin.inbox.$get;

async function fetchInbox({ signal }: { signal: AbortSignal }) {
  const res = await $inbox({}, { init: { signal } });
  if (!res.ok) await throwApiError(res, "loadInbox");

  return res.json();
}

export type Inbox = Awaited<ReturnType<typeof fetchInbox>>;

export const inboxQueryOptions = queryOptions({
  queryKey: ["admin", "inbox"] as const,
  staleTime: 0,
  queryFn: fetchInbox,
});

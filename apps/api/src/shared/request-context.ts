import { AsyncLocalStorage } from "node:async_hooks";
import type { Option, Result } from "@packages/ddd-kit";
import { UNKNOWN_VISITOR, type VisitorGeo } from "./ports/ip-geo.port";
import type { StaffRecord, StaffStoreError } from "./ports/staff-store.port";

/**
 * `clientIp` is a thunk so the trusted-proxy resolution only runs for the requests
 * that read it, and so code without a Hono context (BetterAuth hooks) still gets
 * the resolved address instead of re-reading a client-supplied `X-Forwarded-For`.
 */
type StaffLookup = Promise<Result<Option<StaffRecord>, StaffStoreError>>;

type RequestContext = {
  requestId: string;
  clientIp?: () => string;
  visitorGeo?: () => VisitorGeo;
  staffLookups?: Map<string, StaffLookup>;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function getClientIp(): string | undefined {
  return storage.getStore()?.clientIp?.();
}

export function getVisitorGeo(): VisitorGeo {
  return storage.getStore()?.visitorGeo?.() ?? UNKNOWN_VISITOR;
}

export function staffLookupOnce(userId: string, load: () => StaffLookup): StaffLookup {
  const store = storage.getStore();
  if (!store) return load();

  store.staffLookups ??= new Map();
  const known = store.staffLookups.get(userId);
  if (known) return known;

  const lookup = load();
  store.staffLookups.set(userId, lookup);

  return lookup;
}

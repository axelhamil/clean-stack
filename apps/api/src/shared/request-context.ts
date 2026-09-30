import { AsyncLocalStorage } from "node:async_hooks";

/**
 * `clientIp` is a thunk so the trusted-proxy resolution only runs for the requests
 * that read it, and so code without a Hono context (BetterAuth hooks) still gets
 * the resolved address instead of re-reading a client-supplied `X-Forwarded-For`.
 */
type RequestContext = { requestId: string; clientIp?: () => string };

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

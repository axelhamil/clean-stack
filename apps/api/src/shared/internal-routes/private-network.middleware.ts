import { getConnInfo } from "hono/bun";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

/**
 * Trust the source IP (TCP-level), never the Host header (proxy-spoofable).
 *
 * Allowed prefixes:
 *   - fc00::/7 IPv6 ULA (Railway, Fly internal, generic on-prem private mesh)
 *   - 127.0.0.1 / ::1 loopback (dev + same-host call)
 *
 * Anything else → 401. Public traffic that lands here means a misconfigured
 * proxy or the layer was wired incorrectly.
 */
export const requirePrivateNetwork = createMiddleware(async (c, next) => {
  const info = getConnInfo(c);
  const ip = info.remote.address ?? "";

  const isPrivateIPv6 = ip.startsWith("fd") || ip.startsWith("fc");
  const isLoopback = ip === "127.0.0.1" || ip === "::1";

  if (!isPrivateIPv6 && !isLoopback)
    throw new HTTPException(401, { message: "Public network not permitted" });

  await next();
});

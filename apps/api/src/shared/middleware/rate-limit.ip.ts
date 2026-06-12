import type { Context } from "hono";
import { getConnInfo } from "hono/bun";
import { env } from "../env";

/**
 * Strip IPv4 `:port` suffix (a.b.c.d:port) and IPv6 zone-id (%...) so
 * raw socket addresses with ports or zone identifiers compare equal to
 * the clean IPs stored in TRUSTED_PROXIES.
 */
export function normalizeHop(hop: string): string {
  // IPv4 with port: "1.2.3.4:8080" → "1.2.3.4"
  const ipv4Port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(hop);
  if (ipv4Port) return ipv4Port[1] as string;
  // Bracketed IPv6 with port: "[2001:db8::1]:3000" or "[fe80::1%eth0]:80" → bare IPv6
  const bracketPort = /^\[([^\]]+)\]:\d+$/.exec(hop);
  if (bracketPort) {
    const inner = bracketPort[1] as string;
    const zoneIdx = inner.indexOf("%");
    return zoneIdx !== -1 ? inner.slice(0, zoneIdx) : inner;
  }
  // IPv6 zone-id: "fe80::1%eth0" → "fe80::1"
  const zoneIdx = hop.indexOf("%");
  if (zoneIdx !== -1) return hop.slice(0, zoneIdx);
  return hop;
}

export function resolveClientIp(c: Context): string {
  const rawSocket = getConnInfo(c).remote.address ?? "";
  const socketAddr = normalizeHop(rawSocket);
  const trusted = env.TRUSTED_PROXIES;

  if (!trusted?.includes(socketAddr)) return socketAddr || "unknown";

  const xff = c.req.header("x-forwarded-for");
  if (!xff) return socketAddr || "unknown";

  // OWASP rightmost-non-trusted: walk XFF from right, skip trusted entries,
  // return the first non-trusted entry. Real client IP regardless of proxy chain depth.
  const hops = xff.split(",").map((h) => normalizeHop(h.trim()));
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i];
    if (hop && !trusted.includes(hop)) return hop;
  }

  return socketAddr || "unknown";
}
